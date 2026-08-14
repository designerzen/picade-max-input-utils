cmake_minimum_required(VERSION 3.12)

set(NAME picade-max-input)
set(FAMILY rp2040)
set(BOARD pico_sdk)

include(pico_sdk_import.cmake)
include(pimoroni_pico_import.cmake)

# Gooey boilerplate
project(${NAME} C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

# Initialize the SDK
pico_sdk_init()

# Include Pimoroni libraries
include(drivers/rgbled/rgbled)

function(add_picade_firmware TARGET PROFILE DEVICE_VERSION)
    add_executable(${TARGET})

    target_sources(${TARGET} PUBLIC
        ${CMAKE_CURRENT_LIST_DIR}/main.cpp
        ${CMAKE_CURRENT_LIST_DIR}/picade.cpp
        ${CMAKE_CURRENT_LIST_DIR}/plasma.cpp
        ${CMAKE_CURRENT_LIST_DIR}/usb_descriptors.c
    )

    target_include_directories(${TARGET} PUBLIC
        ${CMAKE_CURRENT_LIST_DIR}
    )

    target_compile_definitions(${TARGET} PUBLIC
        PICADE_USB_PROFILE=${PROFILE}
        USB_DEVICE_VERSION=${DEVICE_VERSION}
    )

    target_link_libraries(${TARGET} PUBLIC
        pico_stdlib hardware_pio hardware_dma hardware_spi pico_unique_id rgbled tinyusb_device tinyusb_board
    )

    pico_generate_pio_header(${TARGET} ${CMAKE_CURRENT_LIST_DIR}/picade.pio)
    pico_add_extra_outputs(${TARGET})
endfunction()

# Original Pimoroni HID + keyboard + CDC layout, retained as a control build.
add_picade_firmware(picade-max-input-legacy 0 0x0110)

# Minimal two-interface layout. This establishes whether keyboard/CDC/IAD
# composition is what prevents macOS from exposing Player 2.
add_picade_firmware(picade-max-input-macos-hid 1 0x0210)

# One HID interface containing two top-level collections with distinct report
# IDs. This is the primary workaround for hosts that collapse duplicate HID
# interfaces belonging to one physical USB device.
add_picade_firmware(picade-max-input-macos-dual-report 2 0x0211)

# The proven dual-report gamepad layout plus the CDC interface required by the
# browser/PhotoSYNTH Plasma protocol.
add_picade_firmware(picade-max-input-macos-dual-report-plasma 3 0x0310)

# Set up files for the release packages
install(FILES
    ${CMAKE_CURRENT_BINARY_DIR}/picade-max-input-legacy.uf2
    ${CMAKE_CURRENT_BINARY_DIR}/picade-max-input-macos-hid.uf2
    ${CMAKE_CURRENT_BINARY_DIR}/picade-max-input-macos-dual-report.uf2
    ${CMAKE_CURRENT_BINARY_DIR}/picade-max-input-macos-dual-report-plasma.uf2
    ${CMAKE_CURRENT_LIST_DIR}/../README.md
    DESTINATION .
)

set(CPACK_INCLUDE_TOPLEVEL_DIRECTORY OFF)
set(CPACK_GENERATOR "ZIP" "TGZ")
include(CPack)
