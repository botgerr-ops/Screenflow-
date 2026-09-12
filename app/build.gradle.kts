plugins { id("com.android.application") }

val signingStorePath = System.getenv("SCREENFLOW_KEYSTORE_PATH")
val signingStorePassword = System.getenv("SCREENFLOW_KEYSTORE_PASSWORD")
val signingKeyAlias = System.getenv("SCREENFLOW_KEY_ALIAS")
val signingKeyPassword = System.getenv("SCREENFLOW_KEY_PASSWORD")
val hasReleaseSigning = listOf(signingStorePath, signingStorePassword, signingKeyAlias, signingKeyPassword).all { !it.isNullOrBlank() }

android {
    namespace = "nl.screenflow.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.screenflow.player"
        minSdk = 26
        targetSdk = 34
        versionCode = 7
        versionName = "0.2.2"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("screenflowRelease") {
                storeFile = file(signingStorePath!!)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("screenflowRelease")
        }
    }
}
