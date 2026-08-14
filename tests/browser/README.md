# Browser gamepad test

This dependency-free page shows exactly what the browser receives through the
Gamepad API. It is useful for comparing the Picade firmware profiles on macOS
and Windows.

The published tester is available at
<https://designerzen.github.io/picade-max-input-utils/>.

## Run it

From the repository root, start the included dependency-free Node server:

```sh
npm run dev
```

Open <http://localhost:8000>, select **Start monitoring**, and press at least
one button for each player. A local server is used because browser device APIs
are restricted to secure contexts; `localhost` qualifies as a secure context.

Set the `PORT` environment variable before starting the server to use a port
other than 8000.

The page does not send data anywhere. Use **Download JSON** after exercising
both players to save a browser, controller, axis, button and event snapshot.

## Plasma lights

In desktop Chrome or Edge, select **Connect Plasma** and approve the Picade Max
serial interface. The page uses PhotoSYNTH's Picade protocol at 115200 baud and
supports both known Picade USB IDs. **Run colour demo** flashes all 32 Plasma
control groups. While gamepad monitoring is active, the 15 standard buttons
for both players illuminate their matching physical Plasma connections.

The combined `picade-max-input-macos-dual-report-plasma.uf2` image exposes the
two gamepads and the Plasma serial interface together. HID-only firmware cannot
be controlled through Web Serial because it deliberately contains no CDC
interface.

## Expected result

For a working two-controller firmware profile, the page should show:

- `2` under **Controllers exposed**;
- two separate controller cards;
- at least two axes and 18 buttons on the Player 1 card;
- named clockwise, counter-clockwise and encoder-push checks; and
- a connected Plasma interface when lighting is being tested; and
- **Input observed** for both controllers after testing both player controls.

If the board LEDs react for both players but only one controller card appears,
the failure is below the web application: macOS/the browser has exposed only
one logical gamepad. Compare JSON snapshots from `macos-hid`,
`macos-dual-report`, and Windows to identify which USB layout is accepted.
