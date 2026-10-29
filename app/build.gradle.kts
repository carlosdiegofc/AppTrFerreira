plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "uy.transportesferreira.gps"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.transportesferreira.app"
        minSdk = 26
        targetSdk = 36
        // Google Play accepts each versionCode only once: every bundle uploaded there needs a higher one, even a rebuild of the same versionName.
        versionCode = 42
        versionName = "0.27.2"
        // Google's map (decision of 26/10/2026): its key only exists in the CI secrets and goes into the manifest when the
        // app is built. Without it the app keeps its own map, as before.
        manifestPlaceholders["mapsApiKey"] = System.getenv("GOOGLE_MAPS_ANDROID_KEY")?.trim().orEmpty()
    }
    // The Google Play upload key only exists in the CI secrets; without it the release bundle stays unsigned.
    signingConfigs {
        System.getenv("TRF_UPLOAD_KEYSTORE")?.takeIf { it.isNotBlank() }?.let { path ->
            create("upload") {
                storeFile = file(path)
                storePassword = System.getenv("TRF_UPLOAD_PASSWORD")
                keyAlias = "upload"
                keyPassword = System.getenv("TRF_UPLOAD_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.findByName("upload")
            // R8 optimizes and obfuscates the Google Play build and leaves out the resources it never uses, as Play Console
            // asks. The mapping that turns crash reports back into the real names goes inside the .aab, where Play Console
            // finds it. The rules the app needs are in proguard-rules.pro.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    // The privacy policy shown in the app is the same file published in docs/legal.
    sourceSets { getByName("main") { assets.srcDir("../docs/legal") } }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    testImplementation("junit:junit:4.13.2")
    // The JSON of Android is empty in unit tests: the real one, only for them.
    testImplementation("org.json:json:20240303")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.android.gms:play-services-maps:19.2.0")
    implementation("com.google.android.material:material:1.12.0")
    // Reads the text of a receipt's photo on the phone itself (decision of 29/10/2026).
    implementation("com.google.mlkit:text-recognition:16.0.1")
}
