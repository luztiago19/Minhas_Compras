"""Ajusta o AndroidManifest gerado pelo Capacitor: permissão da câmera e modelos do ML Kit baixados junto com o app."""
import re, sys
p = 'android/app/src/main/AndroidManifest.xml'
s = open(p, encoding='utf-8').read()
if 'android.permission.CAMERA' not in s:
    s = s.replace('<application', '<uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n\n    <application', 1)
if 'com.google.mlkit.vision.DEPENDENCIES' not in s:
    s = re.sub(r'(<application\b[^>]*>)', r'\1\n        <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="ocr,barcode_ui" />', s, count=1)
open(p, 'w', encoding='utf-8').write(s)
assert 'android.permission.CAMERA' in s and 'DEPENDENCIES' in s, 'não consegui ajustar o manifesto'
print('manifesto ajustado')
