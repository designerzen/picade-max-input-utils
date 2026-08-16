/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 Ha Thach (tinyusb.org)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

#include "tusb.h"
#include "pico/unique_id.h"
#include "custom_gamepad.h"
#include "usb_profile.h"

#ifndef USB_DEVICE_VERSION
// 1.0, Format 0xXXYZ (YY = major, Y = minor, Z = sub)
#define USB_DEVICE_VERSION (0x0100)
#endif

#if PICADE_USB_PROFILE == PICADE_USB_PROFILE_LEGACY
enum {
  ITF_GAMEPAD_1,
  ITF_GAMEPAD_2,
  ITF_KEYBOARD,
  ITF_CDC_0,
  ITF_CDC_0_DATA,
  ITF_NUM_TOTAL
};
#define EPNUM_HID1           0x83
#define EPNUM_HID2           0x84
#define EPNUM_HID3           0x85
#define EPNUM_CDC_0_NOTIF    0x81
#define EPNUM_CDC_0_OUT      0x02
#define EPNUM_CDC_0_IN       0x82
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_HID_ONLY
enum {
  ITF_GAMEPAD_1,
  ITF_GAMEPAD_2,
  ITF_NUM_TOTAL
};
#define EPNUM_HID1           0x81
#define EPNUM_HID2           0x82
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_DUAL_REPORT
enum {
  ITF_GAMEPADS,
  ITF_NUM_TOTAL
};
#define EPNUM_HID1           0x81
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_DUAL_REPORT_CDC
enum {
  ITF_GAMEPADS,
  ITF_CDC_0,
  ITF_CDC_0_DATA,
  ITF_NUM_TOTAL
};
#define EPNUM_CDC_0_NOTIF    0x81
#define EPNUM_CDC_0_OUT      0x02
#define EPNUM_CDC_0_IN       0x82
#define EPNUM_HID1           0x83
#else
enum {
  ITF_GAMEPAD_1,
  ITF_GAMEPAD_2,
  ITF_CDC_0,
  ITF_CDC_0_DATA,
  ITF_NUM_TOTAL
};
#define EPNUM_CDC_0_NOTIF    0x81
#define EPNUM_CDC_0_OUT      0x02
#define EPNUM_CDC_0_IN       0x82
#define EPNUM_HID1           0x83
#define EPNUM_HID2           0x84
#endif

//--------------------------------------------------------------------+
// Device Descriptors
//--------------------------------------------------------------------+

// Storage for 8-byte unique ID, needs 16 + 1 bytes for hex representation + '\0'.
char usb_serial[PICO_UNIQUE_BOARD_ID_SIZE_BYTES * 2 + 1];

tusb_desc_device_t const desc_device =
{
    .bLength            = sizeof(tusb_desc_device_t),
    .bDescriptorType    = TUSB_DESC_DEVICE,
    .bcdUSB             = 0x0200,
#if PICADE_USB_HAS_CDC
    .bDeviceClass       = TUSB_CLASS_MISC,
    .bDeviceSubClass    = MISC_SUBCLASS_COMMON,
    .bDeviceProtocol    = MISC_PROTOCOL_IAD,
#else
    // Let each interface declare its own class. This avoids advertising an
    // IAD composite device when the macOS test builds contain HID only.
    .bDeviceClass       = 0x00,
    .bDeviceSubClass    = 0x00,
    .bDeviceProtocol    = 0x00,
#endif
    .bMaxPacketSize0    = CFG_TUD_ENDPOINT0_SIZE,

    .idVendor           = 0x2e8a,
    .idProduct          = 0x1098,
    .bcdDevice          = USB_DEVICE_VERSION,

    .iManufacturer      = 0x01,
    .iProduct           = 0x02,
    .iSerialNumber      = 0x03,

    .bNumConfigurations = 0x01
};

// Invoked when received GET DEVICE DESCRIPTOR
// Application return pointer to descriptor
uint8_t const * tud_descriptor_device_cb(void)
{
  return (uint8_t const *) &desc_device;
}

void usb_serial_init(void) {
  pico_get_unique_board_id_string(usb_serial, sizeof(usb_serial));
}

//--------------------------------------------------------------------+
// HID Report Descriptor
//--------------------------------------------------------------------+

#if PICADE_USB_IS_DUAL_REPORT
uint8_t const desc_hid_report_gamepads[] =
{
  PICADE_HID_GAMEPAD(HID_REPORT_ID(1)),
  PICADE_HID_GAMEPAD(HID_REPORT_ID(2))
};
#else
uint8_t const desc_hid_report_gamepad1[] = { PICADE_HID_GAMEPAD() };
uint8_t const desc_hid_report_gamepad2[] = { PICADE_HID_GAMEPAD() };
#endif

#if PICADE_USB_HAS_KEYBOARD
uint8_t const desc_hid_report_keyboard[] =
{
  TUD_HID_REPORT_DESC_KEYBOARD()
};
#endif

// Invoked when received GET HID REPORT DESCRIPTOR
// Application return pointer to descriptor
// Descriptor contents must exist long enough for transfer to complete
uint8_t const * tud_hid_descriptor_report_cb(uint8_t itf)
{
#if PICADE_USB_IS_DUAL_REPORT
  if (itf == ITF_GAMEPADS)
  {
    return desc_hid_report_gamepads;
  }
#else
  if (itf == ITF_GAMEPAD_1)
  {
    return desc_hid_report_gamepad1;
  }
  else if (itf == ITF_GAMEPAD_2)
  {
    return desc_hid_report_gamepad2;
  }
#if PICADE_USB_HAS_KEYBOARD
  else if (itf == ITF_KEYBOARD)
  {
    return desc_hid_report_keyboard;
  }
#endif
#endif

  return NULL;
}

//--------------------------------------------------------------------+
// Configuration Descriptor
//--------------------------------------------------------------------+

#if PICADE_USB_PROFILE == PICADE_USB_PROFILE_LEGACY
#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + (3 * TUD_HID_DESC_LEN) + TUD_CDC_DESC_LEN)
#define CONFIG_ATTRIBUTES TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_HID_ONLY
#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + (2 * TUD_HID_DESC_LEN))
#define CONFIG_ATTRIBUTES 0
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_DUAL_REPORT
#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + TUD_HID_DESC_LEN)
#define CONFIG_ATTRIBUTES 0
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_DUAL_REPORT_CDC
#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + TUD_HID_DESC_LEN + TUD_CDC_DESC_LEN)
#define CONFIG_ATTRIBUTES 0
#else
#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + (2 * TUD_HID_DESC_LEN) + TUD_CDC_DESC_LEN)
#define CONFIG_ATTRIBUTES 0
#endif

uint8_t const desc_configuration[] =
{
  // Config number, interface count, string index, total length, attribute, power in mA
  TUD_CONFIG_DESCRIPTOR(1, ITF_NUM_TOTAL, 0, CONFIG_TOTAL_LEN, CONFIG_ATTRIBUTES, 100),

  // Interface number, string index, protocol, report descriptor len, EP In address, size & polling interval
#if PICADE_USB_IS_DUAL_REPORT
  TUD_HID_DESCRIPTOR(ITF_GAMEPADS, 8, HID_ITF_PROTOCOL_NONE, sizeof(desc_hid_report_gamepads), EPNUM_HID1, CFG_TUD_HID_EP_BUFSIZE, 1),
#else
  TUD_HID_DESCRIPTOR(ITF_GAMEPAD_1, 4, HID_ITF_PROTOCOL_NONE,     sizeof(desc_hid_report_gamepad1), EPNUM_HID1, CFG_TUD_HID_EP_BUFSIZE, 1),
  TUD_HID_DESCRIPTOR(ITF_GAMEPAD_2, 5, HID_ITF_PROTOCOL_NONE,     sizeof(desc_hid_report_gamepad2), EPNUM_HID2, CFG_TUD_HID_EP_BUFSIZE, 1),
#if PICADE_USB_HAS_KEYBOARD
  TUD_HID_DESCRIPTOR(ITF_KEYBOARD,  6, HID_ITF_PROTOCOL_KEYBOARD, sizeof(desc_hid_report_keyboard), EPNUM_HID3, CFG_TUD_HID_EP_BUFSIZE, 1),
#endif
#endif
#if PICADE_USB_HAS_CDC
  TUD_CDC_DESCRIPTOR(ITF_CDC_0,     7, EPNUM_CDC_0_NOTIF, 8, EPNUM_CDC_0_OUT, EPNUM_CDC_0_IN, 64),
#endif
};

// Invoked when received GET CONFIGURATION DESCRIPTOR
// Application return pointer to descriptor
// Descriptor contents must exist long enough for transfer to complete
uint8_t const * tud_descriptor_configuration_cb(uint8_t index)
{
  (void) index; // for multiple configurations
  return desc_configuration;
}

//--------------------------------------------------------------------+
// String Descriptors
//--------------------------------------------------------------------+

// array of pointer to string descriptors
char const* string_desc_arr [] =
{
  (const char[]) { 0x09, 0x04 },  // 0: is supported language is English (0x0409)
  "Pimoroni",                     // 1: Manufacturer
#if PICADE_USB_PROFILE == PICADE_USB_PROFILE_LEGACY
  "Picade Max",                   // 2: Product
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_HID_ONLY
  "Picade Max macOS HID",         // 2: Product
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_DUAL_REPORT
  "Picade Max Dual Report",       // 2: Product
#elif PICADE_USB_PROFILE == PICADE_USB_PROFILE_DUAL_REPORT_CDC
  "Picade Max Dual + Plasma",     // 2: Product
#else
  "Picade Max HID + Plasma",      // 2: Product
#endif
  usb_serial,                     // 3: Serials, should use chip ID
  "GamePad 1",
  "GamePad 2",
  "Keyboard",
  "Plasma",
  "Dual GamePads",
};

static uint16_t _desc_str[32];

// Invoked when received GET STRING DESCRIPTOR request
// Application return pointer to descriptor, whose contents must exist long enough for transfer to complete
uint16_t const* tud_descriptor_string_cb(uint8_t index, uint16_t langid)
{
  (void) langid;

  uint8_t chr_count;

  if ( index == 0)
  {
    memcpy(&_desc_str[1], string_desc_arr[0], 2);
    chr_count = 1;
  }else
  {
    // Note: the 0xEE index string is a Microsoft OS 1.0 Descriptors.
    // https://docs.microsoft.com/en-us/windows-hardware/drivers/usbcon/microsoft-defined-usb-descriptors

    if ( !(index < sizeof(string_desc_arr)/sizeof(string_desc_arr[0])) ) return NULL;

    const char* str = string_desc_arr[index];

    // Cap at max char
    chr_count = (uint8_t) strlen(str);
    if ( chr_count > 31 ) chr_count = 31;

    // Convert ASCII string into UTF-16
    for(uint8_t i=0; i<chr_count; i++)
    {
      _desc_str[1+i] = str[i];
    }
  }

  // first byte is length (including header), second byte is string type
  _desc_str[0] = (uint16_t) ((TUSB_DESC_STRING << 8 ) | (2*chr_count + 2));

  return _desc_str;
}
