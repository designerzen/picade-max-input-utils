# Picade Max Input Utils

The Picade Max Input sounds great on paper but is badly documented and doesn't work as designed. This repo brings together things learned trying to implement the board.

The red LED will turn on when a button is pressed, unless there are multiple button presses. The LED will light up green on boot and will remain green until a button is pressed. If the LED is red on startup, it is likely because a button was pressed when the board was turned on - pressing RESET without touching any buttons will fix that.

With the buttons closest to you. the pins are not as specified on the PCB. The actual signals sent out via USB are as follows

PLAYER 2 [DUP|RS|LS|START|SELECT] [Y|RT|RB|LT|LB] [B|A|P2|P1|X]
[PLASMA]
[USB-C]
PLAYER 1 [DUP|RS|LS|START|SELECT] [Y|RT|RB|LT|LB] [B|A|P2|P1|X]


The buttons on the Picade joystick panel are labeled 1-6 which is not helpful when trying to match them to the none numbered sockets. I recommend the following layout :

1. X
2. Y
3. RT
4. A
5. B
6. LT

Coin. Select
1UP. Start

Left side button. LB
Right side button. RB

Which lined up are

[DUP|RS|LS|1UP START|COIN SELECT] [2 Y|3 RT|RB RB|6 LT|LB LB] [5 B|4 A|P2|P1|1 X] [USB-C]

Plasma Control
===

Connecting the plasma buttons does not illuminate the buttons despite what the documentation suggests. There are some python libraries designed for controlling these lights, a javascript version also exists.

Forked firmware
===

This repository now includes the Pimoroni Picade Max Input firmware as the base
for a macOS compatibility fork. The original input scanning and button mapping
are retained. The build produces three firmware images so host enumeration can
be tested independently from the Picade hardware:

* `picade-max-input-legacy.uf2` preserves the original two gamepads, inactive
  boot keyboard and Plasma CDC serial interface.
* `picade-max-input-macos-hid.uf2` exposes only two HID gamepad interfaces. It
  removes the inactive keyboard, CDC serial interfaces and composite IAD device
  class that may interfere with macOS enumeration.
* `picade-max-input-macos-dual-report.uf2` exposes one HID interface containing
  two Game Pad application collections. Player 1 uses report ID 1 and Player 2
  uses report ID 2. This is intended for hosts that collapse two similar HID
  interfaces belonging to one physical USB device.
* `picade-max-input-macos-dual-report-plasma.uf2` keeps that dual-report layout
  and adds the CDC serial interface required for Plasma lights. Use this image
  when gamepad input, the rotary encoder and browser-controlled lighting must
  work together.

Test the `macos-hid` image first. If macOS or the target application still
shows only one controller, test `macos-dual-report` and record whether IOHID and
the application expose one or two logical controllers.

The HID-only builds deliberately disable Plasma serial control. Once the
working macOS layout is established, Plasma support can be added back without
reintroducing the inactive keyboard interface.

Plasma browser control
---

The GitHub Pages tester can connect to one or more Picade Max CDC interfaces
with Web Serial, run a 32-control colour demo, and illuminate the matching
physical Plasma control while any of the 15 standard buttons for either player
is held. It uses the PhotoSYNTH `multiverse:data` frame protocol at 115200 baud
and supports both known Picade USB IDs. Web Serial requires HTTPS or localhost
and a supporting desktop browser such as Chrome or Edge.

Building
---

The project currently follows the upstream Pico SDK build arrangement. Set
`PICO_SDK_PATH` and `PIMORONI_PICO_PATH`, then configure and build with CMake:

```sh
cmake -S firmware -B build/firmware \
  -DPICO_SDK_PATH=/path/to/pico-sdk \
  -DPIMORONI_PICO_PATH=/path/to/pimoroni-pico
cmake --build build/firmware --parallel
```

All RP2040 firmware sources and CMake support files live in `firmware/`.
Host-side utilities are kept separately in `tools/`.

The **CMake** GitHub Actions workflow can also be started manually. A manual
run always stores the installed UF2 files as a workflow artifact. To publish a
GitHub Release as well, enter a unique `release_tag` such as `v0.1.0` in the
**Run workflow** form. Leave the tag blank for an artifact-only build. Manual
releases default to prereleases so experimental USB profiles are not presented
as stable firmware accidentally.

Updating the board
---

1. Hold `RESET` and press `BOOT` on the Picade Max Input board.
2. Release the buttons when the `RPI-RP2` drive appears.
3. Copy one UF2 image to the drive. The board will reboot automatically.

The three builds use different USB device version numbers, but macOS may cache
USB/HID properties. Unplug the controller between tests. If results look stale,
use a different physical USB port or reboot the Mac before comparing builds.

Browser gamepad test
---

A dependency-free diagnostic page in `tests/browser` enumerates every gamepad
the browser exposes, displays all axes and buttons live, and records whether
input was observed from each logical controller. Run it from the repository
root with:

```sh
npm run dev
```

Open <http://localhost:8000>, select **Start monitoring**, then press buttons
for both players. Use **Download JSON** to capture results for comparison across
firmware profiles, browsers, macOS and Windows. See
[`tests/browser/README.md`](tests/browser/README.md) for expected results.

The tester is also deployed to
<https://designerzen.github.io/picade-max-input-utils/> by the dedicated GitHub
Pages workflow whenever its browser assets change on `main`. The workflow can
also be started manually from the repository's **Actions** tab.
