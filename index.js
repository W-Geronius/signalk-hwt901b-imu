    const PLUGIN_ID = 'signalk-hwt901b-imu'
    const SerialPort = require('serialport')
    const DelimiterParser = require('@serialport/parser-delimiter')

    const decodeWit = 0.0054931640625 // (180.00 / 32768)
    const factRad = 0.0174532925199 // * pi/180

    module.exports = function (app) {
    var plugin = {};
    var statusMessage

    plugin.id = PLUGIN_ID
        plugin.name = "WITMOTION HWT901B serial IMU Sensor"
        plugin.description = "SignalK node server plugin reading roll, pitch and course from WITMOTION's HWT910B sensor"

        plugin.schema = {
        type: "object",
        properties: {
            devices: {
                type: 'array',
                title: 'Devices',
                items: {
                    type: 'object',
                    properties: {
                        usbDevice: {
                            type: "string",
                            title: "USB Device Name",
                        default:
                            "/dev/ttyUSB0"
                        },
                        yOffset: {
                            type: "number",
                            title: "Roll Offset",
                            description: "roll: degrees offset (-180.0° to 180.0°)",
                        default:
                            0.0
                        },
                        xOffset: {
                            type: "number",
                            title: "Pitch Offset",
                            description: "pitch: degrees offset (-180.0° to 180.0°)",
                        default:
                            0.0
                        },
                        zOffset: {
                            type: "number",
                            title: "Heading Offset",
                            description: "heading degrees offset (-180.0° to 180.0°)",
                        default:
                            0.0
                        }
                    }
                }
            }
        }
    }

    const setPluginStatus = app.setPluginStatus
         ? (msg) => {
        app.setPluginStatus(msg)
        statusMessage = msg
    }
     : (msg) => {
        statusMessage = msg
    }

    const setPluginError = app.setPluginError
         ? (msg) => {
        app.setPluginError(msg)
        statusMessage = `error: ${msg}`
    }
     : (msg) => {
        statusMessage = `error: ${msg}`
    }

    plugin.start = function (options) {
        plugin.reconnectDelay = 1000
            let devices = options.devices
            plugin.serialPorts = []
            devices.forEach((device, index) => {
                plugin.connect(device.usbDevice, device.xOffset, device.yOffset, device.zOffset, index)
            })
    }

    plugin.connect = function (usbDevice, xOffset, yOffset, zOffset, index) {
        console.log(`connecting to ${usbDevice}:${index}`)
        try {
            let serial = new SerialPort(usbDevice, {
                baudRate: 9600
            })
                plugin.serialPorts[index] = serial

                serial.on('open', function () {
                    const parser = serial.pipe(new DelimiterParser({
                                delimiter: '\x55\x53'
                            }))
                        plugin.reconnectDelay = 1000
                        parser.on('data', data => {
                            parseData(xOffset, yOffset, zOffset, data, index)
                        })
                        setPluginStatus(`connected to ${usbDevice} : ${index}`)
                })

                serial.on('error', function (err) {
                    app.error(err.toString())
                    setPluginError(err.toString())
                    scheduleReconnect(usbDevice, xOffset, yOffset, zOffset, index)
                })

                serial.on('close', function () {
                    app.debug("closed")
                    scheduleReconnect(usbDevice, xOffset, yOffset, zOffset, index)
                })
        } catch (err) {
            app.error(err)
            setPluginError(err.message)
            scheduleReconnect(usbDevice, xOffset, yOffset, zOffset, index)
        }
    }

    function scheduleReconnect(usbDevice, xOffset, yOffset, zOffset, index) {
        plugin.reconnectDelay *= plugin.reconnectDelay < 60 * 1000 ? 1.5 : 1
        const msg = `Not connected (retry delay ${(plugin.reconnectDelay / 1000).toFixed(0)} s)`
            console.log(msg)
            setPluginError(msg)
            setTimeout(plugin.connect.bind(plugin, usbDevice, xOffset, yOffset, zOffset, index), plugin.reconnectDelay)
    }

    plugin.statusMessage = () => {
        return statusMessage
    }

    plugin.stop = function () {
        if (plugin.serialPorts) {
            plugin.serialPorts.forEach(serial => {
                serial.close()
            })
        }
    }

    function parseData(xOffset, yOffset, zOffset, data, index) {
        app.debug('Data:', data)
        if (checkWitData(data)) {
            var pitch = toRad(data.readUInt16LE(0), xOffset)
                var roll = toRad(data.readUInt16LE(2), yOffset)
                var hdm = (360.00 - data.readUInt16LE(4) * decodeWit + zOffset);
            (hdm > 360) ? hdm = (hdm - 360) * factRad : hdm *= factRad
            app.debug('° roll:', (roll / factRad).toFixed(6),
                '° pitch', (pitch / factRad).toFixed(6),
                '° heading:', (hdm / factRad).toFixed(6))

            //  send to SK
            app.handleMessage(plugin.id, {
                updates: [{
                        '$source': 'WIT.' + (index + 1).toString(),
                        values: [{
                                path: 'navigation.headingMagnetic',
                                value: hdm
                            }, {
                                path: 'navigation.attitude',
                                value: {
                                    roll: roll,
                                    pitch: pitch,
                                    yaw: null
                                }
                            }
                        ]
                    }
                ]
            })
            setPluginStatus('Connected and receiving data')
        }
    }

    function toRad(value, offset) {
        value *= decodeWit
        value += offset;
        value >= 180.00 ? value -= 360 : value
        return (value * factRad)
    }

    function checkWitData(data) {
        if (data.byteLength == 9) {
            var checksum = 168 // 0x55 + 0x53  Angle record
                for (i = 0; i < 8; i++) {
                    checksum += data.readUInt8(i)
                }
                if (data.readUInt8(8) == checksum % 256) {
                    return true
                }
        }
        return false
    }

    return plugin
}
