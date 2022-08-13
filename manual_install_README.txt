***
Dieses Plugin ist nicht im SignalK Appstore verfügbar und muss händisch installiert werden - Anleitung für RPi

*** Voraussetzungen am seriellen WITMOTION-Sensor:
* Sensoreinstellungen über Wit MiniIMU (starten ohne Internetverbindung!) VOR DEM ANSCHLUSS an RPi  
  Kalibrieren nach Anleitung
  Baud Rate:     9600
  Output Rate:   sinnvollerweise <= 2Hz, Gesamtlast SK-Server beachten!
  Content:       AUSSCHLIESSLICH 'Angle' selektieren!

*** Installation - einstweilen nur manuell (Integration in den SK-Webstore ggf. nach der Beta-Phase):
1) Automatische Schnittstellenerkennung abschalten (z.B. in AvNav Server Settings: [4]UsbSerialReader [disabled])
2) Verzeichnis signalk-hwt901b-imu mit allen Inhalten kopieren nach /home/pi/.signalk/node_modules
3) "signalk-hwt901b-imu": "^0.0.0" eintragen in /home/pi/.signalk/package.json
4) SignalK Server neu starten
5) Plugin konfigurieren über den SignalK Menüpunkt Server/Plugin Config
  
*** Einschränkungen des Plugin:
* Keine commands an den Sensor möglich, wie z.b. 'reset z-Axis Angle', 'Reference Set'.
* Multi Device Definition ist vorbereitet, aber nicht fertiggestellt & nicht getestet (in Arbeit)
* Fehlerbehandlung nicht durchgängig getestet (in Arbeit)

*** Deinstallation - einstweilen nur manuell (Integration in den SK-Webstore ggf. nach der Beta-Phase):
1) ggf. SK Server stoppen
2) "signalk-hwt901b-imu" Eintrag aus /home/pi/.signalk/package.json entfernen
3) Verzeichnis /home/pi/.signalk/node_modules/signalk-hwt901b-imu komplett löschen
4) Konfigurationsdatei /home/pi/.signalk/plugin-config-data/signalk-hwt901b-imu.json löschen
5) SK Server restart