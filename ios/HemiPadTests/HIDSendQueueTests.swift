import XCTest
@testable import HemiPad

/// La file qui retient les rapports quand la radio Bluetooth sature.
///
/// Le défaut qu'elle corrige ne se voit que sur une vraie liaison chargée : un
/// relâchement jeté, et le bouton reste enfoncé côté console. On le vérifie
/// donc ici, sans radio.
final class HIDSendQueueTests: XCTestCase {
    private let pressed: [UInt8] = [1, 0, 0]
    private let released: [UInt8] = [0, 0, 0]

    func testTheLatestGamepadStateAlwaysLeavesEvenWhenTheRadioIsFull() {
        var queue = HIDSendQueue()
        queue.enqueue(.gamepad, payload: pressed)
        queue.enqueue(.gamepad, payload: released)

        // La radio refuse tout : rien n'est perdu, tout attend.
        queue.drain { _ in false }
        XCTAssertEqual(queue.entries.count, 1, "un seul état de manette attend : le plus récent")

        // Elle se libère : c'est le relâchement qui part, pas l'appui périmé.
        var sent: [[UInt8]] = []
        queue.drain { entry in
            sent.append(entry.payload)
            return true
        }
        XCTAssertEqual(sent, [released])
        XCTAssertTrue(queue.isEmpty)
    }

    func testKeystrokesAllLeaveInOrder() {
        var queue = HIDSendQueue()
        let a: [UInt8] = [0, 0, 4]
        let none: [UInt8] = [0, 0, 0]
        let b: [UInt8] = [0, 0, 5]
        for payload in [a, none, b, none] {
            queue.enqueue(.keyboard, payload: payload)
        }
        var sent: [[UInt8]] = []
        queue.drain { entry in
            sent.append(entry.payload)
            return true
        }
        XCTAssertEqual(sent, [a, none, b, none], "appui puis relâchement : garder les deux, dans l'ordre")
    }

    func testDrainStopsWhereTheRadioRefusesAndResumesThere() {
        var queue = HIDSendQueue()
        queue.enqueue(.keyboard, payload: [1])
        queue.enqueue(.keyboard, payload: [2])
        queue.enqueue(.keyboard, payload: [3])
        var accepted = 1
        var sent: [[UInt8]] = []
        queue.drain { entry in
            guard accepted > 0 else { return false }
            accepted -= 1
            sent.append(entry.payload)
            return true
        }
        XCTAssertEqual(sent, [[1]])
        queue.drain { entry in
            sent.append(entry.payload)
            return true
        }
        XCTAssertEqual(sent, [[1], [2], [3]])
    }

    func testKeyboardOverflowDropsTheOldestAndKeepsTheCurrentState() {
        var queue = HIDSendQueue(keyboardCapacity: 3)
        for index in 1...5 {
            queue.enqueue(.keyboard, payload: [UInt8(index)])
        }
        queue.enqueue(.gamepad, payload: released)
        XCTAssertEqual(
            queue.entries.filter { $0.reportID == .keyboard }.map(\.payload),
            [[3], [4], [5]],
            "les plus anciens tombent, le dernier état reste"
        )
        XCTAssertEqual(queue.entries.last?.payload, released, "la manette n'est pas touchée")
    }

    func testClearingEmptiesEverything() {
        var queue = HIDSendQueue()
        queue.enqueue(.gamepad, payload: pressed)
        queue.enqueue(.keyboard, payload: [4])
        queue.removeAll()
        XCTAssertTrue(queue.isEmpty)
    }
}
