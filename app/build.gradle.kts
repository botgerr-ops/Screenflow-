plugins { id("com.android.application") }

android {
    namespace = "nl.screenflow.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.screenflow.player"
        minSdk = 26
        targetSdk = 34
        versionCode = 6
        versionName = "0.2.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
