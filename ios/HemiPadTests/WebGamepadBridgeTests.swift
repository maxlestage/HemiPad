import CoreGraphics
import JavaScriptCore
import WebKit
import XCTest
@testable import HemiPad

final class WebGamepadBridgeTests: XCTestCase {
    func testButtonsFollowTheStandardLayout() {
        var state = GamepadState()
        state.set(.faceSouth, pressed: true)
        state.set(.dpadLeft, pressed: true)
        state.set(.home, pressed: true)
        state.set(.triggerRight, pressed: true)
        let buttons = WebGamepadBridge.buttons(for: state)
        XCTAssertEqual(buttons.count, WebGamepadBridge.buttonCount)
        XCTAssertEqual(buttons[0], 1, "A, en bas : bouton 0")
        XCTAssertEqual(buttons[14], 1, "croix gauche : bouton 14")
        XCTAssertEqual(buttons[16], 1, "bouton Xbox : 16")
        XCTAssertEqual(buttons[7], 1, "gâchette droite : 7, analogique")
        XCTAssertEqual(buttons.filter { $0 > 0 }.count, 4)
    }

    func testVerticalAxesAreFlippedForTheWeb() {
        var state = GamepadState()
        state.leftStick = CGPoint(x: 0.5, y: 1)
        state.rightStick = CGPoint(x: -1, y: -0.25)
        XCTAssertEqual(WebGamepadBridge.axes(for: state), [0.5, -1, -1, 0.25])
    }

    func testOutOfRangeValuesAreClamped() {
        var state = GamepadState()
        state.leftStick = CGPoint(x: 4, y: .nan)
        state.leftTrigger = 9
        XCTAssertEqual(WebGamepadBridge.axes(for: state)[0], 1)
        XCTAssertEqual(WebGamepadBridge.axes(for: state)[1], 0)
        XCTAssertEqual(WebGamepadBridge.buttons(for: state)[6], 1)
    }

    func testUpdateScriptContainsOnlyNumbers() {
        var state = GamepadState()
        state.leftStick = CGPoint(x: 0.25, y: 0.5)
        let script = WebGamepadBridge.updateScript(for: state)
        XCTAssertTrue(script.hasPrefix("window.__hemipad&&window.__hemipad.update(["))
        let arguments = script.drop(while: { $0 != "(" })
        XCTAssertTrue(arguments.allSatisfy { "0123456789.,-[]()".contains($0) }, String(arguments))
    }

    func testNavigationStaysOnMicrosoftDomains() {
        let allowed = [
            "https://www.xbox.com/fr-FR/play",
            "https://xbox.com/play",
            "https://login.live.com/oauth20_authorize.srf",
            "https://login.microsoftonline.com/common",
            "about:blank"
        ]
        let refused = [
            "http://www.xbox.com/play",
            "https://xbox.com.exemple.fr/play",
            "https://faux-xbox.com/play",
            "https://exemple.fr/?r=https://www.xbox.com",
            "javascript:alert(1)",
            "file:///etc/passwd"
        ]
        for link in allowed {
            XCTAssertTrue(WebGamepadBridge.isAllowed(URL(string: link)!), link)
        }
        for link in refused {
            XCTAssertFalse(WebGamepadBridge.isAllowed(URL(string: link)!), link)
        }
    }

    /// Le script injecté, exécuté pour de vrai : la manette apparaît après le
    /// premier état, porte les bonnes valeurs, et ne fait rien hors de
    /// xbox.com.
    func testInjectedScriptExposesAStandardGamepad() throws {
        let context = try XCTUnwrap(JSContext())
        context.evaluateScript(Self.browserStub(hostname: "www.xbox.com"))
        context.evaluateScript(WebGamepadBridge.injectedScript)
        XCTAssertNil(context.exception)
        XCTAssertEqual(context.evaluateScript("navigator.getGamepads().length").toInt32(), 0)

        var state = GamepadState()
        state.set(.faceEast, pressed: true)
        state.leftStick = CGPoint(x: 0, y: 1)
        context.evaluateScript(WebGamepadBridge.updateScript(for: state))
        XCTAssertNil(context.exception)
        XCTAssertEqual(context.evaluateScript("connexions").toInt32(), 1)
        XCTAssertEqual(context.evaluateScript("navigator.getGamepads()[0].mapping").toString(), "standard")
        XCTAssertTrue(context.evaluateScript("navigator.getGamepads()[0].buttons[1].pressed").toBool())
        XCTAssertFalse(context.evaluateScript("navigator.getGamepads()[0].buttons[0].pressed").toBool())
        XCTAssertEqual(context.evaluateScript("navigator.getGamepads()[0].axes[1]").toDouble(), -1)
    }

    func testInjectedScriptDoesNothingOutsideXbox() throws {
        let context = try XCTUnwrap(JSContext())
        context.evaluateScript(Self.browserStub(hostname: "xbox.com.exemple.fr"))
        context.evaluateScript(WebGamepadBridge.injectedScript)
        XCTAssertNil(context.exception)
        XCTAssertTrue(context.evaluateScript("typeof window.__hemipad === 'undefined'").toBool())
    }

    /// Si la signature d'un délégué ne correspondait pas exactement à celle de
    /// WebKit, iOS ne l'appellerait jamais — et la navigation ne serait plus
    /// bornée, sans le moindre message. On vérifie que WebKit la voit.
    @MainActor
    func testNavigationGuardsAreSeenByWebKit() {
        let page = RemotePlayPage(loadsStartPage: false)
        XCTAssertTrue(page.webView.navigationDelegate === page)
        XCTAssertTrue(page.responds(to: NSSelectorFromString("webView:decidePolicyForNavigationAction:decisionHandler:")))
        XCTAssertTrue(page.responds(to: NSSelectorFromString("webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:")))
    }

    /// Juste assez de navigateur pour exécuter le script.
    private static func browserStub(hostname: String) -> String {
        """
        var window = this;
        var location = { hostname: '\(hostname)' };
        var performance = { now: function () { return 1 } };
        var connexions = 0;
        function Event(type) { this.type = type }
        window.dispatchEvent = function (e) { if (e.type === 'gamepadconnected' && e.gamepad) connexions++ };
        var navigator = { getGamepads: function () { return [] } };
        """
    }
}
