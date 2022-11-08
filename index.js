const PLUGIN_ID = 'signalk-hwt901b-imu';
const SerialPort = require('serialport')
const DelimiterParser = require('@serialport/parser-delimiter')

const freqs = ["0.2Hz", "0.5Hz", "1Hz", "2Hz", "5Hz", "10Hz", "20Hz", "50Hz"]

module.exports = function (app) {
    var plugin = {};
    var statusMessage

    plugin.id = PLUGIN_ID
    plugin.name = "WITMOTION HWT901B serial IMU"
    plugin.description = "SignalK node server plugin reading roll, pitch and magnetic heading from WITMOTION's HWT910B sensor"

    plugin.schema = {
        type: "object",
        required: ["usbDevice", "freq", "zOffset"],
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
                            description: "USB device: e.g. /dev/ttyUSB0 or COM3 (Windows)",
                            default: "/dev/ttyUSB0"
                        },
                        freq: {
                            type: "string",
                            title: "Return Rate",
                            description: "deltas/second",
                            default: "2Hz",
                            enum: freqs
                        },
                        accCal: {
                            type: "boolean",
                            title: "Accelerometer calibration",
                            description: "automatically resets to false after execution",
                            default: false
                        },
                        angleRef: {
                            type: "boolean",
                            title: "Reset Angle Reference",
                            description: "set roll & pitch to level, automatically resets to false after execution",
                            default: false
                        },
                        zOffset: {
                            type: "number",
                            title: "Heading Offset",
                            description: "heading degrees offset (-180.0° to 180.0°)",
                            default: 0.0
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
        : (msg) => { statusMessage = msg }

    const setPluginError = app.setPluginError
        ? (msg) => {
            app.setPluginError(msg)
            statusMessage = `error: ${msg}`
        }
        : (msg) => { statusMessage = `error: ${msg}` }

    plugin.start = function (options) {
        plugin.reconnectDelay = 1000
        let devices = options.devices
        plugin.serialPorts = []
        devices.forEach((device, index) => {
            plugin.connect(device, index)
            // todo: configure should only start when device is up and running!
            configureDevice(device, index)
            options.devices[index].accCal = false
            options.devices[index].angleRef = false
            app.savePluginOptions(options, () => { app.debug('Plugin options saved') });
        })
    }

    plugin.connect = function (device, index) {
        app.debug('plugin.connect')
        console.log(`connecting to ${device.usbDevice}:${index}`)
        try {
            let serial = new SerialPort(device.usbDevice, { baudRate: 9600 })
            plugin.serialPorts[index] = serial

            serial.on('open', function () {
                const parser = serial.pipe(new DelimiterParser({ delimiter: '\x55\x53' }))
                plugin.reconnectDelay = 1000
                parser.on('data', data => { parseData(device.zOffset, data, index) })
                setPluginStatus(`connected to ${device.usbDevice}:${index}`)
            })

            serial.on('error', function (err) {
                app.debug("plugin.connect.error")
                app.error(err.toString())
                setPluginError(err.toString())
                scheduleReconnect(device, index)
            })

            serial.on('close', function () {
                app.debug("plugin.connect.close")
                // scheduleReconnect(device, index)
            })
        }
        catch (err) {
            app.error(err)
            setPluginError(err.message)
            scheduleReconnect(device, index)
        }
    }

    function configureDevice(device, index) {

        const cmdUnlock = new Uint8Array([0xFF, 0xAA, 0x69, 0x88, 0xB5])

        var cmdFreq = new Uint8Array([0xFF, 0xAA, 0x03, 0x00, 0x00])
        cmdFreq[3] = freqs.indexOf(device.freq) + 1

        // set frequency unconditionally
        setTimeout(() => {
            sendCommand(cmdFreq)
            setTimeout(() => {
                saveConfig("frequency")
            }, 200)
        }, 10000)

        // set data set unconditionally
        setTimeout(() => {
            sendCommand(new Uint8Array([0xFF, 0xAA, 0x02, 0x48, 0x00]))
            setTimeout(() => {
                saveConfig("data set")
            }, 200)
        }, 12000)

        // calibrate acceleration if requested by plugin.options

        if (device.accCal) {
            setTimeout(() => {
                app.debug('calibrate acc ...')
                sendCommand(new Uint8Array([0xFF, 0xAA, 0x01, 0x01, 0x00]))
                app.debug('calibrating ...')
                setTimeout(() => {
                    sendCommand(new Uint8Array([0xFF, 0xAA, 0x01, 0x00, 0x00]))
                    setTimeout(() => {
                        saveConfig("acc calibration")
                    }, 200)
                }, 5000)
            }, 14000)
        }

        // reset angles if requested by plugin.options

        if (device.angleRef) {
            setTimeout(() => {
                app.debug('resetting x/y ...')
                sendCommand(new Uint8Array([0xFF, 0xAA, 0x01, 0x08, 0x00]))
                setTimeout(() => {
                    saveConfig("x/y level")
                }, 200)
            }, 20000)
        }

        function sendCommand(array) {
            plugin.serialPorts[index].write(cmdUnlock)      // unlock WIT configuration
            setTimeout(() => {
                plugin.serialPorts[index].write(array)      // write command after 200ms
                app.debug('command sent:', array)
            }, 200)
        }

        function saveConfig(comment) {
            plugin.serialPorts[index].write(cmdUnlock)      // unlock WIT configuration
            setTimeout(() => {                              // save WIT configuration after 200ms
                plugin.serialPorts[index].write(new Uint8Array([0xFF, 0xAA, 0x00, 0x00, 0x00]));
                app.debug('WIT config saved:', comment)
            }, 200)
        }
    }

    function parseData(zOffset, data, index) {

        const decodeWit = 0.0054931640625   // (180.00 / 32768)
        const factRad = 0.0174532925199     // * pi/180

        app.debug('parsed Data:', data)

        if (checkWitData(data)) { // TODO: refactoring check data (NOW always true)

            var pitch = toRad(data.readUInt16LE(0))
            var roll = toRad(data.readUInt16LE(2))
            var hdm = (360.00 - data.readUInt16LE(4) * decodeWit + zOffset);
            (hdm > 360) ? hdm = (hdm - 360) * factRad : hdm *= factRad

            var pressure = data[14].toString(16).concat(data[13].toString(16)).concat(data[12].toString(16)).concat(data[11].toString(16))
            pressure = (parseInt(pressure, 16)/100)

            var altitude = data[18].toString(16).concat(data[17].toString(16)).concat(data[16].toString(16)).concat(data[15].toString(16))
            altitude = (parseInt(altitude, 16)/100)

            app.debug('° roll:', (roll / factRad).toFixed(6),
                '° pitch', (pitch / factRad).toFixed(6),
                '° heading:', (hdm / factRad).toFixed(6),
                '(hPa) Pressure:', pressure.toFixed(2),
                '(m) Altitude:', altitude.toFixed(2),
            )

            //  send to SK
            app.handleMessage(plugin.id, {
                updates: [{
                    '$source': 'WIT.' + (index + 1).toString(),
                    values: [
                        {
                            path: 'navigation.pressure',
                            value: pressure
                        },
                        {
                            path: 'navigation.altitude',
                            value: altitude
                        },
                        {
                            path: 'navigation.headingMagnetic',
                            value: hdm
                        },
                        {
                            path: 'navigation.attitude',
                            value: {
                                roll: roll,
                                pitch: pitch,
                                yaw: null
                            }
                        }
                    ]
                }]
            })
            setPluginStatus('Connected and receiving data')
        }

        function toRad(value) {
            value *= decodeWit
            value >= 180.00 ? value -= 360 : value
            return (value * factRad)
        }

        function checkWitData(data) {
            if (data.byteLength == 9) {
                var checksum = 168  // 0x55 + 0x53  Angle record
                for (i = 0; i < 8; i++) { checksum += data.readUInt8(i) }
                if (data.readUInt8(8) == checksum % 256) { return true }
            }

            return true;
        }

        return false
    }

    function scheduleReconnect(device, index) {
        plugin.reconnectDelay *= plugin.reconnectDelay < 60 * 1000 ? 1.5 : 1
        const msg = `Not connected (retry delay ${(plugin.reconnectDelay / 1000).toFixed(0)} s)`
        console.log(msg)
        setPluginError(msg)
        setTimeout(plugin.connect.bind(plugin, device, index), plugin.reconnectDelay)
    }

    plugin.statusMessage = () => {
        return statusMessage
    }

    plugin.stop = function () {
        app.debug('plugin.stop')
        if (plugin.serialPorts) {
            plugin.serialPorts.forEach(serial => {
                serial.close()
            }
            )
            plugin.serialPorts = []
        }
    }

    return plugin
}
