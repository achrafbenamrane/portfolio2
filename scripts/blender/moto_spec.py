"""The numbers that make it a real motorcycle. Imported by the moto scripts, never run."""

import math

import numpy as np

WHEELBASE = 1.45
FRONT_Y, REAR_Y = -WHEELBASE / 2, WHEELBASE / 2
FRONT_R, REAR_R = 0.30, 0.3225
RAKE = math.radians(24.5)
TRAIL = 0.103
AXIS_FOOT = np.array([0, FRONT_Y - TRAIL, 0.0])
AXIS = np.array([0, math.sin(RAKE), math.cos(RAKE)])
AHEAD = np.array([0, -math.cos(RAKE), math.sin(RAKE)])
FORK_OFFSET = 0.0307
FORK_X = 0.1025
SWING_PIVOT = np.array([0, 0.165, 0.47])
FRONT_AXLE = np.array([0, FRONT_Y, FRONT_R])
REAR_AXLE = np.array([0, REAR_Y, REAR_R])
X = (1, 0, 0)


def on_axis(s, ahead=0.0):
    """A point up the steering axis, and forward of it."""
    return AXIS_FOOT + AXIS * s + AHEAD * ahead
