import XCTest
@testable import HemiPad

/// Le garde-fou qui empêche un plantage de se répéter à chaque lancement.
final class BLEPublicationSentinelTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName = ""

    override func setUp() {
        super.setUp()
        suiteName = "hemipad.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    func testACompletedPublicationLeavesTheFullProfile() {
        let sentinel = BLEPublicationSentinel(defaults: defaults)
        sentinel.willPublish()
        sentinel.didPublish()
        XCTAssertFalse(BLEPublicationSentinel(defaults: defaults).recordInterruptedPublication())
        XCTAssertEqual(sentinel.level, .full)
    }

    func testEachInterruptedPublicationStepsDownUntilPaused() {
        // Premier lancement : l'application s'arrête pendant la publication.
        BLEPublicationSentinel(defaults: defaults).willPublish()

        // Deuxième lancement : on le remarque, le profil devient prudent.
        let second = BLEPublicationSentinel(defaults: defaults)
        XCTAssertTrue(second.recordInterruptedPublication())
        XCTAssertEqual(second.level, .withoutReportReference)

        // Il s'arrête encore : le Bluetooth se met en pause, plus de boucle.
        second.willPublish()
        let third = BLEPublicationSentinel(defaults: defaults)
        XCTAssertTrue(third.recordInterruptedPublication())
        XCTAssertEqual(third.level, .paused)

        // Et il y reste, même si d'autres arrêts sont notés.
        third.willPublish()
        let fourth = BLEPublicationSentinel(defaults: defaults)
        fourth.recordInterruptedPublication()
        XCTAssertEqual(fourth.level, .paused)
    }

    func testTheDetectionRunsOnlyOncePerInterruption() {
        BLEPublicationSentinel(defaults: defaults).willPublish()
        let sentinel = BLEPublicationSentinel(defaults: defaults)
        XCTAssertTrue(sentinel.recordInterruptedPublication())
        XCTAssertFalse(sentinel.recordInterruptedPublication(), "une seule descente par arrêt")
        XCTAssertEqual(sentinel.level, .withoutReportReference)
    }

    func testLoweringNeverRaises() {
        let sentinel = BLEPublicationSentinel(defaults: defaults)
        sentinel.lower(to: .paused)
        sentinel.lower(to: .withoutReportReference)
        XCTAssertEqual(sentinel.level, .paused)
    }

    func testRetryStartsAgainFromTheFullProfile() {
        let sentinel = BLEPublicationSentinel(defaults: defaults)
        sentinel.lower(to: .paused)
        sentinel.willPublish()
        sentinel.reset()
        XCTAssertEqual(sentinel.level, .full)
        XCTAssertFalse(sentinel.recordInterruptedPublication())
    }
}
