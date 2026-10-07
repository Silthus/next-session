import ctypes
import struct
import sys
import zlib

out = sys.argv[1]
x11 = ctypes.cdll.LoadLibrary("libX11.so.6")
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XGetImage.restype = ctypes.c_void_p
x11.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int,
                          ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]
x11.XGetPixel.restype = ctypes.c_ulong
x11.XGetPixel.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]


class XWindowAttributes(ctypes.Structure):
    _fields_ = [("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int),
                ("height", ctypes.c_int), ("pad", ctypes.c_byte * 256)]


display = x11.XOpenDisplay(None)
root = x11.XDefaultRootWindow(display)
attrs = XWindowAttributes()
x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p]
x11.XGetWindowAttributes(display, root, ctypes.byref(attrs))
width = int(sys.argv[2]) if len(sys.argv) > 2 else attrs.width
height = int(sys.argv[3]) if len(sys.argv) > 3 else attrs.height
image = x11.XGetImage(display, root, 0, 0, width, height, 0xFFFFFFFF, 2)
rows = bytearray()
for y in range(height):
    rows.append(0)
    for x in range(width):
        pixel = x11.XGetPixel(image, x, y)
        rows += bytes(((pixel >> 16) & 255, (pixel >> 8) & 255, pixel & 255))


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
open(out, "wb").write(png)
