# Keystore — dónde está y cómo usarla

## Ubicación

La keystore que firma este APK/AAB **NO está en el repo** (intencional, por seguridad).

```
C:\Users\lualz\.keys\thanotectas\android.keystore
```

Alias: `android`

## Por qué fuera del repo

Si la keystore se filtra (push accidental a repo público, fork, leak):
- Cualquiera puede firmar APKs maliciosas que Google Play y los dispositivos del usuario aceptarán como auténticas.
- Es **imposible** revocar una keystore de Android — el daño es permanente.
- Hay que mantenerla aislada del árbol de git.

## Cómo usarla

El `twa-manifest.json` apunta a la ruta absoluta. Para firmar:

```powershell
cd C:\Users\lualz\Documents\GitHub\personal\thanotectas\android
bubblewrap build
# Cuando pida la password de la keystore, la introduces manualmente.
```

## Builds históricos firmados

También fuera del repo:

```
C:\Users\lualz\.keys\thanotectas\releases\
  app-release-signed.apk
  app-release-bundle.aab
  app-release-signed.apk.idsig
  app-release-unsigned-aligned.apk
```

## Respaldo

⚠️ **HACER BACKUP** de `C:\Users\lualz\.keys\thanotectas\android.keystore` en almacenamiento seguro (USB cifrado, gestor de contraseñas con archivos adjuntos, etc.). Si se pierde, **no puedes publicar updates** de esta app — Google Play exige firma con la misma keystore.

## Si necesitas mover la keystore

Editar `twa-manifest.json` → campo `signingKey.path` con la nueva ruta absoluta.
