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

# Assinatura fixa: força o Gradle a usar signing/debug.keystore (antes ele criava uma chave nova a cada build)
g = 'android/app/build.gradle'
t = open(g, encoding='utf-8').read()
if 'signing/debug.keystore' not in t:
    t += '''

android {
    signingConfigs {
        debug {
            storeFile file("${rootProject.projectDir}/../signing/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
}
'''
    open(g, 'w', encoding='utf-8').write(t)
assert 'signing/debug.keystore' in open(g, encoding='utf-8').read(), 'não consegui configurar a assinatura'
print('assinatura fixa configurada')
