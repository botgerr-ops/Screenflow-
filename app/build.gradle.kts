plugins { id("com.android.application") }

android {
    namespace = "nl.screenflow.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.screenflow.player"
        minSdk = 26
        targetSdk = 34
        versionCode = 4
        versionName = "0.1.3"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
