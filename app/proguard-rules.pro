# R8 rules of the Google Play build (app/build.gradle.kts).
#
# The app keeps nothing of its own by name: it finds no class, method or resource by its name (no reflection, no
# JavaScript interface on the maps, no getIdentifier), and the activity, the GPS service and the file provider are kept
# from the manifest. WorkManager (which builds SyncWorker by its name), Play services, AndroidX and Material bring their
# own rules. New code or a new library that looks something up by name needs its rule here, and the emulator test of the
# CI (.github/scripts/probar_app_optimizada.py) should still pass.

# Crash reports in Play Console keep their line numbers; the mapping inside the .aab gives back the real names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
