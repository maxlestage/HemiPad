import CoreGraphics
import XCTest
@testable import HemiPad

/// Les règles d'accessibilité sont la raison d'être de l'application : elles
/// méritent d'être vérifiées comme du code métier, pas comme de la décoration.
final class ReachEnvelopeTests: XCTestCase {
    private let size = CGSize(width: 390, height: 740)

    func testMirroringFollowsDominantHand() {
        var right = HemiplegiaProfile.default
        right.dominantHand = .right
        var left = right
        left.dominantHand = .left

        let rightEnvelope = ReachEnvelope(profile: right, size: size)
        let leftEnvelope = ReachEnvelope(profile: left, size: size)

        XCTAssertGreaterThan(rightEnvelope.pivot.x, size.width / 2)
        XCTAssertLessThan(leftEnvelope.pivot.x, size.width / 2)
        XCTAssertEqual(rightEnvelope.pivot.y, leftEnvelope.pivot.y, accuracy: 0.001)
    }

    func testArcStartsAtVerticalAndSweepsInward() {
        var profile = HemiplegiaProfile.default
        profile.dominantHand = .right
        let envelope = ReachEnvelope(profile: profile, size: size)

        let first = envelope.position(radius: 200, index: 0, count: 4)
        let last = envelope.position(radius: 200, index: 3, count: 4)

        XCTAssertEqual(first.x, envelope.pivot.x, accuracy: 0.001, "l'arc part à la verticale du pouce")
        XCTAssertLessThan(last.x, first.x, "pour une main droite, il balaie vers l'intérieur")
        XCTAssertLessThan(first.y, envelope.pivot.y, "et toujours vers le haut de l'écran")
    }

    func testEveryAngleStaysInsideTheComfortZone() {
        let envelope = ReachEnvelope(profile: .default, size: size)
        for index in 0..<5 {
            let radius = (envelope.innerRadius + envelope.outerRadius) / 2
            let point = envelope.position(radius: radius, index: index, count: 5)
            XCTAssertTrue(envelope.contains(point), "la position \(index) sort de la zone atteignable")
        }
    }

    func testPointsBehindTheThumbAreOutOfReach() {
        var profile = HemiplegiaProfile.default
        profile.dominantHand = .right
        let envelope = ReachEnvelope(profile: profile, size: size)
        // À droite du pivot, il n'y a que le bord du téléphone.
        let behind = CGPoint(x: envelope.pivot.x + envelope.outerRadius * 0.8, y: envelope.pivot.y)
        XCTAssertFalse(envelope.contains(behind))
    }

    func testRigidOffsetPreservesRelativeDistances() {
        let envelope = ReachEnvelope(profile: .default, size: size)
        let moved = envelope.offset(by: CGSize(width: -20, height: 30))
        let a = envelope.position(radius: 150, index: 1, count: 4)
        let b = moved.position(radius: 150, index: 1, count: 4)
        XCTAssertEqual(b.x - a.x, -20, accuracy: 0.001)
        XCTAssertEqual(b.y - a.y, 30, accuracy: 0.001)
        XCTAssertEqual(moved.span, envelope.span)
    }
}

/// La règle « tout reste atteignable, rien ne se chevauche » est vérifiée sur
/// toutes les tailles d'écran, les deux mains et toutes les consoles : c'est la
/// promesse fonctionnelle de l'application, pas une préférence esthétique.
/// La disposition libre laisse la personne décider : le solveur ne doit plus
/// rien imposer, sauf de garder chaque commande entièrement à l'écran.
final class FreeLayoutTests: XCTestCase {
    private let size = CGSize(width: 393, height: 740)

    private func freeProfile() -> HemiplegiaProfile {
        var profile = HemiplegiaProfile.default
        profile.layoutMode = .free
        return profile
    }

    func testFreeModeStartsFromTheAutomaticLayout() {
        let automatic = ControllerLayout.solve(profile: .default, console: .switch2, size: size)
        let free = ControllerLayout.solve(profile: freeProfile(), console: .switch2, size: size)
        XCTAssertEqual(free.placements.map(\.id), automatic.placements.map(\.id))
        for placement in free.placements {
            let reference = automatic.placement(for: placement.id)
            XCTAssertEqual(placement.center.x, reference?.center.x ?? -1, accuracy: 0.001)
            XCTAssertEqual(placement.center.y, reference?.center.y ?? -1, accuracy: 0.001)
        }
    }

    func testStoredPositionIsUsed() {
        var profile = freeProfile()
        profile.updatePreference(for: ControlKey.key(for: .faceSouth)) {
            $0.freePosition = CGPoint(x: 0.25, y: 0.6)
        }
        let solution = ControllerLayout.solve(profile: profile, console: .switch2, size: size)
        let placement = solution.placement(for: ControlKey.key(for: .faceSouth))
        XCTAssertEqual(placement?.center.x ?? 0, size.width * 0.25, accuracy: 0.5)
        XCTAssertEqual(placement?.center.y ?? 0, size.height * 0.6, accuracy: 0.5)
    }

    func testPositionsAreClampedInsideTheScreen() {
        var profile = freeProfile()
        profile.updatePreference(for: ControlKey.key(for: .faceNorth)) {
            $0.freePosition = CGPoint(x: 1.4, y: -0.3)
        }
        profile.updatePreference(for: ControlKey.key(for: .faceEast)) {
            $0.freePosition = CGPoint(x: -0.5, y: 1.9)
        }
        let solution = ControllerLayout.solve(profile: profile, console: .switch2, size: size)
        for placement in solution.placements {
            XCTAssertGreaterThanOrEqual(placement.frame.minX, -0.5)
            XCTAssertLessThanOrEqual(placement.frame.maxX, size.width + 0.5)
            XCTAssertLessThanOrEqual(placement.frame.maxY, size.height + 0.5)
            XCTAssertGreaterThanOrEqual(
                placement.frame.minY,
                ControllerLayout.topBand - 0.5,
                "une commande sous le bandeau d'état ne recevrait aucun appui"
            )
        }
    }

    func testOverlapsAreReportedButNotPrevented() {
        var profile = freeProfile()
        // Deux commandes posées au même endroit : la personne en a le droit,
        // l'application doit le signaler.
        profile.updatePreference(for: ControlKey.key(for: .faceSouth)) {
            $0.freePosition = CGPoint(x: 0.5, y: 0.5)
        }
        profile.updatePreference(for: ControlKey.key(for: .faceEast)) {
            $0.freePosition = CGPoint(x: 0.5, y: 0.5)
        }
        let solution = ControllerLayout.solve(profile: profile, console: .switch2, size: size)
        XCTAssertEqual(solution.placements.count, 13, "aucune commande n'est retirée")
        XCTAssertTrue(solution.overlapping.contains(ControlKey.key(for: .faceSouth)))
        XCTAssertTrue(solution.overlapping.contains(ControlKey.key(for: .faceEast)))
    }

    func testAutomaticLayoutNeverOverlaps() {
        let solution = ControllerLayout.solve(profile: .default, console: .switch2, size: size)
        XCTAssertTrue(solution.overlapping.isEmpty)
    }

    func testResetsClearOnlyWhatTheyShould() {
        var profile = freeProfile()
        let key = ControlKey.key(for: .triggerLeft)
        profile.updatePreference(for: key) {
            $0.freePosition = CGPoint(x: 0.3, y: 0.7)
            $0.sizeScale = 1.4
            $0.activation = .latch
        }

        profile.clearFreePositions()
        XCTAssertNil(profile.preference(key).freePosition)
        XCTAssertEqual(profile.preference(key).sizeScale, 1.4, accuracy: 0.001)
        XCTAssertEqual(profile.preference(key).activation, .latch)

        profile.resetControlPreferences()
        XCTAssertTrue(profile.preference(key).isDefault)
    }

    func testLockedControlRefusesToMove() {
        var profile = freeProfile()
        let key = ControlKey.key(for: .faceSouth)
        profile.updatePreference(for: key) { $0.freePosition = CGPoint(x: 0.3, y: 0.7) }
        profile.setLocked(true, for: [key])

        let moved = profile.setFreePosition(CGPoint(x: 0.8, y: 0.2), for: key)
        XCTAssertFalse(moved, "une commande verrouillée ne se déplace pas")
        XCTAssertEqual(profile.preference(key).freePosition?.x ?? 0, 0.3, accuracy: 0.001)

        let solution = ControllerLayout.solve(profile: profile, console: .switch2, size: size)
        let placement = solution.placement(for: key)
        XCTAssertEqual(placement?.center.x ?? 0, size.width * 0.3, accuracy: 0.5)
    }

    func testUnlockingRestoresMovement() {
        var profile = freeProfile()
        let key = ControlKey.key(for: .faceEast)
        profile.setLocked(true, for: [key])
        XCTAssertFalse(profile.setFreePosition(CGPoint(x: 0.4, y: 0.4), for: key))

        profile.setLocked(false, for: [key])
        XCTAssertTrue(profile.setFreePosition(CGPoint(x: 0.4, y: 0.4), for: key))
        XCTAssertEqual(profile.preference(key).freePosition?.y ?? 0, 0.4, accuracy: 0.001)
    }

    func testLockingAppliesToSeveralControlsAtOnce() {
        var profile = freeProfile()
        let keys = [ControlKey.key(for: .triggerLeft), ControlKey.key(for: .triggerRight)]
        profile.setLocked(true, for: keys)
        XCTAssertEqual(profile.lockedKeys.sorted(), keys.sorted())
        XCTAssertTrue(keys.allSatisfy { profile.isLocked($0) })

        profile.setLocked(false, for: keys)
        XCTAssertTrue(profile.lockedKeys.isEmpty)
    }

    func testResetPositionsSparesLockedControls() {
        var profile = freeProfile()
        let libre = ControlKey.key(for: .faceNorth)
        let fige = ControlKey.key(for: .faceSouth)
        profile.setFreePosition(CGPoint(x: 0.2, y: 0.3), for: libre)
        profile.setFreePosition(CGPoint(x: 0.7, y: 0.8), for: fige)
        profile.setLocked(true, for: [fige])

        profile.clearFreePositions()

        XCTAssertNil(profile.preference(libre).freePosition, "les commandes libres reviennent en place")
        XCTAssertEqual(
            profile.preference(fige).freePosition?.x ?? 0,
            0.7,
            accuracy: 0.001,
            "« tout replacer » ne défait pas ce qui a été explicitement verrouillé"
        )
    }

    func testLockIsPartOfTheStoredState() {
        var profile = HemiplegiaProfile.default
        let key = ControlKey.key(for: .home)
        profile.setLocked(true, for: [key])
        XCTAssertEqual(profile.controlPreferences.count, 1)
        profile.setLocked(false, for: [key])
        XCTAssertTrue(profile.controlPreferences.isEmpty, "un verrou retiré ne laisse pas de trace")
    }

    func testNeutralPreferencesAreNotStored() {
        var profile = HemiplegiaProfile.default
        let key = ControlKey.key(for: .faceNorth)
        profile.updatePreference(for: key) { $0.sizeScale = 1.3 }
        XCTAssertEqual(profile.controlPreferences.count, 1)
        profile.updatePreference(for: key) { $0.sizeScale = 1 }
        XCTAssertTrue(profile.controlPreferences.isEmpty, "un réglage neutre ne s'enregistre pas")
    }
}

final class ControllerLayoutTests: XCTestCase {
    private let sizes: [CGSize] = [
        CGSize(width: 320, height: 480),  // très petit écran
        CGSize(width: 375, height: 560),  // iPhone SE, zone utile
        CGSize(width: 393, height: 740),  // iPhone récent
        CGSize(width: 430, height: 810),  // grand iPhone
        CGSize(width: 768, height: 1000)  // iPad en portrait
    ]

    private func profiles() -> [HemiplegiaProfile] {
        var large = HemiplegiaProfile.default
        large.targetScale = 2
        var small = HemiplegiaProfile.default
        small.targetScale = 0.9
        var leftHanded = HemiplegiaProfile.default
        leftHanded.dominantHand = .left
        return [.default, .lowEffort, .tremorControl, large, small, leftHanded]
    }

    func testNothingOverlaps() {
        for size in sizes {
            for profile in profiles() {
                for console in ConsoleProfile.all {
                    let solution = ControllerLayout.solve(profile: profile, console: console, size: size)
                    let placements = solution.placements
                    for i in placements.indices {
                        for j in placements.indices where j > i {
                            let a = placements[i]
                            let b = placements[j]
                            let distance = hypot(a.center.x - b.center.x, a.center.y - b.center.y)
                            XCTAssertGreaterThanOrEqual(
                                distance,
                                a.halfExtent + b.halfExtent - 0.5,
                                "\(a.id) et \(b.id) se chevauchent en \(Int(size.width))×\(Int(size.height))"
                            )
                        }
                    }
                }
            }
        }
    }

    func testEverythingStaysOnScreen() {
        for size in sizes {
            for profile in profiles() {
                let solution = ControllerLayout.solve(profile: profile, console: .switch2, size: size)
                for placement in solution.placements {
                    let frame = placement.frame
                    XCTAssertGreaterThanOrEqual(frame.minX, -1, "\(placement.id) déborde à gauche")
                    XCTAssertLessThanOrEqual(frame.maxX, size.width + 1, "\(placement.id) déborde à droite")
                    XCTAssertGreaterThanOrEqual(
                        frame.minY,
                        ControllerLayout.topBand - 1,
                        "\(placement.id) passe sous le bandeau d'état"
                    )
                    XCTAssertLessThanOrEqual(frame.maxY, size.height + 1, "\(placement.id) sort par le bas")
                }
            }
        }
    }

    func testSpacingSettingIsHonouredWhenThereIsRoom() {
        var profile = HemiplegiaProfile.default
        profile.controlSpacing = 1.5
        let solution = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 768, height: 1000)
        )
        XCTAssertEqual(solution.spacing, 1.5, accuracy: 0.001)
        XCTAssertFalse(solution.wasTightened)

        // L'espacement demandé se retrouve dans les distances réelles.
        let placements = solution.placements
        for i in placements.indices {
            for j in placements.indices where j > i {
                let a = placements[i]
                let b = placements[j]
                let distance = hypot(a.center.x - b.center.x, a.center.y - b.center.y)
                XCTAssertGreaterThanOrEqual(distance, a.halfExtent + b.halfExtent - 0.5)
            }
        }
    }

    func testCrampedScreenTightensSpacingOnlyAfterTargetsHitTheFloor() {
        var profile = HemiplegiaProfile.default
        profile.controlSpacing = 1.6
        let solution = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 375, height: 560)
        )
        // Les cibles cèdent d'abord : un bouton sous 44 pt n'est plus une cible.
        XCTAssertEqual(solution.targetSize, ControllerLayout.minimumTargetSize, accuracy: 0.5)
        XCTAssertTrue(solution.wasTightened)
        XCTAssertGreaterThanOrEqual(solution.spacing, ControllerLayout.minimumSpacing)
        XCTAssertLessThan(solution.spacing, 1.6)
    }

    func testHiddenControlsDisappearAndFreeRoom() {
        var profile = HemiplegiaProfile.default
        let full = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 393, height: 740)
        )

        for control in ControllerLayout.systemOrder {
            profile.updatePreference(for: ControlKey.key(for: control)) { $0.isVisible = false }
        }
        let reduced = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 393, height: 740)
        )

        XCTAssertEqual(reduced.placements.count, full.placements.count - 4)
        XCTAssertNil(reduced.placement(for: ControlKey.key(for: .start)))
        XCTAssertGreaterThan(
            reduced.targetSize,
            full.targetSize,
            "retirer l'anneau le plus contraignant doit rendre de la place aux autres"
        )
    }

    func testPerControlSizeScaleIsApplied() {
        var profile = HemiplegiaProfile.default
        profile.updatePreference(for: ControlKey.key(for: .faceSouth)) { $0.sizeScale = 1.5 }
        let solution = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 430, height: 810)
        )
        let south = solution.placement(for: ControlKey.key(for: .faceSouth))
        let east = solution.placement(for: ControlKey.key(for: .faceEast))
        XCTAssertNotNil(south)
        XCTAssertNotNil(east)
        XCTAssertEqual(south!.size.width, east!.size.width * 1.5, accuracy: 0.5)
        // Même agrandie, elle ne recouvre pas sa voisine.
        let distance = hypot(south!.center.x - east!.center.x, south!.center.y - east!.center.y)
        XCTAssertGreaterThanOrEqual(distance, south!.halfExtent + east!.halfExtent - 0.5)
    }

    func testTargetsNeverFallBelowAppleMinimum() {
        for size in sizes {
            let solution = ControllerLayout.solve(profile: .default, console: .switch2, size: size)
            XCTAssertGreaterThanOrEqual(solution.targetSize, ControllerLayout.minimumTargetSize)
        }
    }

    func testLargeTargetsAreHonouredWhenThereIsRoom() {
        var profile = HemiplegiaProfile.default
        profile.targetScale = 1.6
        let roomy = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 768, height: 1000)
        )
        XCTAssertEqual(roomy.targetSize, profile.baseTargetSize, accuracy: 0.5)
        XCTAssertFalse(roomy.wasDownscaled)
    }

    func testCrampedScreenReducesTargetsRatherThanHidingThem() {
        var profile = HemiplegiaProfile.default
        profile.targetScale = 2
        let cramped = ControllerLayout.solve(
            profile: profile,
            console: .switch2,
            size: CGSize(width: 320, height: 480)
        )
        XCTAssertTrue(cramped.wasDownscaled)
        XCTAssertEqual(cramped.placements.count, 13, "aucune commande ne disparaît")
    }

    func testConsoleWithoutCaptureDropsOnlyThatControl() {
        let retro = ControllerLayout.solve(
            profile: .default,
            console: .retro,
            size: CGSize(width: 393, height: 740)
        )
        let controls = retro.placements.compactMap(\.element.control)
        XCTAssertFalse(controls.contains(.capture))
        XCTAssertTrue(controls.contains(.start))
        XCTAssertEqual(retro.placements.count, 12)
    }

    func testDirectionalWidgetSitsClosestToTheThumb() {
        let solution = ControllerLayout.solve(
            profile: .default,
            console: .switch2,
            size: CGSize(width: 393, height: 740)
        )
        let pivot = solution.envelope.pivot
        let distances = solution.placements.map {
            (id: $0.id, distance: hypot($0.center.x - pivot.x, $0.center.y - pivot.y))
        }
        let closest = distances.min { $0.distance < $1.distance }
        XCTAssertEqual(closest?.id, "directional")
    }
}

final class TremorFilterTests: XCTestCase {
    func testFilterAttenuatesJitterAroundRest() {
        var filter = TremorFilter2D(damping: 0.8, deadzone: 0)
        var time: TimeInterval = 0
        var last = CGPoint.zero
        // Tremblement de ±0,2 à 30 Hz autour du centre.
        for step in 0..<60 {
            let jitter = (step % 2 == 0 ? 0.2 : -0.2)
            time += 1.0 / 30.0
            last = filter.filter(CGPoint(x: jitter, y: 0), timestamp: time)
        }
        XCTAssertLessThan(abs(last.x), 0.12, "le tremblement résiduel doit être nettement réduit")
    }

    func testFilterStillFollowsDeliberateMovement() {
        var filter = TremorFilter2D(damping: 0.8, deadzone: 0)
        var time: TimeInterval = 0
        var last = CGPoint.zero
        for step in 0..<30 {
            time += 1.0 / 60.0
            last = filter.filter(CGPoint(x: CGFloat(step) / 30.0, y: 0), timestamp: time)
        }
        XCTAssertGreaterThan(last.x, 0.6, "un geste franc ne doit pas être mangé par le filtre")
    }

    func testDeadzoneRescalesRemainingTravel() {
        let inside = TremorFilter2D.applyDeadzone(CGPoint(x: 0.1, y: 0), deadzone: 0.2)
        XCTAssertEqual(inside, .zero)

        let outside = TremorFilter2D.applyDeadzone(CGPoint(x: 1, y: 0), deadzone: 0.2)
        XCTAssertEqual(outside.x, 1, accuracy: 0.001, "la course pleine reste atteignable")

        let middle = TremorFilter2D.applyDeadzone(CGPoint(x: 0.6, y: 0), deadzone: 0.2)
        XCTAssertEqual(middle.x, 0.5, accuracy: 0.001)
    }
}

@MainActor
final class InputArbiterTests: XCTestCase {
    func testLatchModeKeepsButtonDownAfterRelease() {
        var profile = HemiplegiaProfile.default
        profile.activationMode = .latch
        profile.debounceInterval = 0
        let arbiter = InputArbiter(profile: profile)

        arbiter.touchDown(.faceSouth)
        arbiter.touchUp(.faceSouth)
        XCTAssertTrue(arbiter.state.isPressed(.faceSouth), "un appui verrouillant survit au relâchement")

        arbiter.touchDown(.faceSouth)
        arbiter.touchUp(.faceSouth)
        XCTAssertFalse(arbiter.state.isPressed(.faceSouth), "le second appui libère")
    }

    func testDebounceIgnoresImmediateRepress() {
        var profile = HemiplegiaProfile.default
        profile.activationMode = .direct
        profile.debounceInterval = 5
        let arbiter = InputArbiter(profile: profile)

        arbiter.touchDown(.faceEast)
        arbiter.touchUp(.faceEast)
        arbiter.touchDown(.faceEast) // rebond parasite
        XCTAssertFalse(arbiter.state.isPressed(.faceEast))
    }

    func testDirectionalPadNeverLatches() {
        var profile = HemiplegiaProfile.default
        profile.activationMode = .latch
        profile.debounceInterval = 0
        let arbiter = InputArbiter(profile: profile)

        arbiter.touchDown(.dpadLeft)
        arbiter.touchUp(.dpadLeft)
        XCTAssertFalse(arbiter.state.isPressed(.dpadLeft), "une direction verrouillée ferait tourner en rond")
    }

    func testClearLatchesReleasesEverything() {
        var profile = HemiplegiaProfile.default
        profile.activationMode = .latch
        profile.debounceInterval = 0
        let arbiter = InputArbiter(profile: profile)

        arbiter.touchDown(.triggerLeft)
        arbiter.touchUp(.triggerLeft)
        XCTAssertTrue(arbiter.state.isPressed(.triggerLeft))

        arbiter.clearLatches()
        XCTAssertTrue(arbiter.latched.isEmpty)
        XCTAssertFalse(arbiter.state.isPressed(.triggerLeft))
    }

    func testStickKeepsPositionWhenAutoCentreDisabled() {
        var profile = HemiplegiaProfile.default
        profile.stickAutoCenter = false
        profile.tremorDamping = 0
        profile.stickDeadzone = 0
        let arbiter = InputArbiter(profile: profile)

        arbiter.moveStick(.left, to: CGPoint(x: 0.9, y: 0))
        arbiter.releaseStick(.left)
        XCTAssertNotEqual(arbiter.state.leftStick, .zero, "le stick garde la position quand on lève le doigt")

        arbiter.centerStick(.left)
        XCTAssertEqual(arbiter.state.leftStick, .zero)
    }

    func testPerControlActivationOverridesTheGeneralSetting() {
        var profile = HemiplegiaProfile.default
        profile.activationMode = .direct
        profile.debounceInterval = 0
        profile.updatePreference(for: ControlKey.key(for: .triggerLeft)) { $0.activation = .latch }
        let arbiter = InputArbiter(profile: profile)

        // La gâchette verrouille…
        arbiter.touchDown(.triggerLeft)
        arbiter.touchUp(.triggerLeft)
        XCTAssertTrue(arbiter.state.isPressed(.triggerLeft))

        // …pendant que le bouton de saut reste en appui direct.
        arbiter.touchDown(.faceSouth)
        arbiter.touchUp(.faceSouth)
        XCTAssertFalse(arbiter.state.isPressed(.faceSouth))
    }

    func testDirectionalPadIgnoresPerControlActivation() {
        var profile = HemiplegiaProfile.default
        profile.debounceInterval = 0
        profile.updatePreference(for: ControlKey.key(for: .dpadUp)) { $0.activation = .latch }
        let arbiter = InputArbiter(profile: profile)

        arbiter.touchDown(.dpadUp)
        arbiter.touchUp(.dpadUp)
        XCTAssertFalse(arbiter.state.isPressed(.dpadUp), "une direction verrouillée ferait tourner en rond")
    }

    func testStateChangeCallbackFires() {
        let arbiter = InputArbiter(profile: .default)
        var received: [GamepadState] = []
        arbiter.onStateChange = { received.append($0) }

        arbiter.touchDown(.faceNorth)
        XCTAssertEqual(received.count, 1)
        XCTAssertTrue(received.last?.isPressed(.faceNorth) ?? false)
    }
}

@MainActor
final class StickyModifierTests: XCTestCase {
    func testChordIsBuiltOneKeyAtATime() {
        let engine = StickyModifierEngine()
        engine.tap(.leftGUI)
        engine.tap(.leftShift)
        XCTAssertEqual(engine.effective, [.leftGUI, .leftShift], "⌘ + ⇧ sans maintenir deux doigts")

        engine.consume()
        XCTAssertTrue(engine.effective.isEmpty, "les modificateurs retombent après la frappe")
    }

    func testDoubleTapLocksModifier() {
        let engine = StickyModifierEngine()
        engine.tap(.leftShift)
        engine.tap(.leftShift) // double appui rapide
        XCTAssertTrue(engine.locked.contains(.leftShift))

        engine.consume()
        XCTAssertTrue(engine.effective.contains(.leftShift), "un modificateur verrouillé survit à la frappe")

        engine.tap(.leftShift)
        XCTAssertFalse(engine.effective.contains(.leftShift), "un appui suivant le libère")
    }

    func testClearResetsEverything() {
        let engine = StickyModifierEngine()
        engine.tap(.leftControl)
        engine.tap(.leftAlt)
        engine.clear()
        XCTAssertTrue(engine.effective.isEmpty)
    }
}

final class ConsoleProfileTests: XCTestCase {
    func testEveryProfileLabelsEveryAvailableControl() {
        for profile in ConsoleProfile.all {
            for control in profile.availableControls {
                XCTAssertFalse(
                    profile.glyph(for: control).isEmpty,
                    "\(profile.displayName) n'étiquette pas \(control.rawValue)"
                )
            }
        }
    }

    func testNintendoKeepsItsInvertedFaceButtons() {
        XCTAssertEqual(ConsoleProfile.switch2.glyph(for: .faceSouth), "B")
        XCTAssertEqual(ConsoleProfile.xbox.glyph(for: .faceSouth), "A")
    }

    func testRetroProfileHidesCaptureButton() {
        XCTAssertFalse(ConsoleProfile.retro.has(.capture))
        XCTAssertTrue(ConsoleProfile.switch2.has(.capture))
    }

    func testButtonIndicesAreUnique() {
        let indices = ControlID.allCases.compactMap(\.hidButtonIndex)
        XCTAssertEqual(Set(indices).count, indices.count, "deux contrôles ne peuvent pas partager un bouton HID")
    }
}
