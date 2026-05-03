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
