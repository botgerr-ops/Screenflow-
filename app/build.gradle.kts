plugins { id("com.android.application") }

android {
    namespace = "nl.screenflow.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.screenflow.player"
        minSdk = 26
        targetSdk = 34
        versionCode = 5
        versionName = "0.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
