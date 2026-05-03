# picade-max-input-utils
The Picade Max Input sounds great on paper but is badly documented and doesn't work as designed. This repo brings together things learned trying to implement the board

With the buttons closest to you. the pins are not as specified on the PCB. The actual signals sent out via USB are as follows, from the right most pin to the left

1.

X

P1

P2

A

B


LB

LT

RB

RT

Y


SELECT

START

LS

RS

DUP


---
USB PORT
PLASMA PORT
---

2.

X

P1

P2

A

B


LB

LT

RB

RT

Y


SELECT

START

LS

RS

DUP



Plasma Control 
===

Connecting the plasma buttons does not illuminate the buttons despite what the documentation suggests. There are some python libraries designed for controlling these lights, a javascript version also exists.
