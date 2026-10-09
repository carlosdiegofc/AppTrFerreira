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
        versionCode = 20
        versionName = "0.15.1"
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
        getByName("release") { signingConfig = signingConfigs.findByName("upload") }
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
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.android.material:material:1.12.0")
}
