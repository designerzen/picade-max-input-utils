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

## Expected result

For a working two-controller firmware profile, the page should show:

- `2` under **Controllers exposed**;
- two separate controller cards;
- at least two axes and 15 buttons on each card; and
- **Input observed** for both controllers after testing both player controls.

If the board LEDs react for both players but only one controller card appears,
the failure is below the web application: macOS/the browser has exposed only
one logical gamepad. Compare JSON snapshots from `macos-hid`,
`macos-dual-report`, and Windows to identify which USB layout is accepted.
