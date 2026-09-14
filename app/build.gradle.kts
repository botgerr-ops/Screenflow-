plugins { id("com.android.application") }

dependencies { testImplementation("junit:junit:4.13.2") }

val signingStorePath = System.getenv("SCREENFLOW_KEYSTORE_PATH")
val signingStorePassword = System.getenv("SCREENFLOW_KEYSTORE_PASSWORD")
val signingKeyAlias = System.getenv("SCREENFLOW_KEY_ALIAS")
val signingKeyPassword = System.getenv("SCREENFLOW_KEY_PASSWORD")
val hasReleaseSigning = listOf(signingStorePath, signingStorePassword, signingKeyAlias, signingKeyPassword).all { !it.isNullOrBlank() }

android {
    namespace = "nl.screenflow.player"
    compileSdk = 34

    buildFeatures { buildConfig = true }

    defaultConfig {
        applicationId = "nl.screenflow.player"
        minSdk = 26
        targetSdk = 34
        versionCode = 12
        versionName = "0.5.4-test"
        buildConfigField("String", "PLAYER_API_BASE_URL", "\"https://bqapbwsvfofgnfogwhdx.supabase.co/functions/v1\"")
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
        debug {
            buildConfigField("boolean", "PLAYER_TEST_BUILD", "true")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("screenflowRelease")
        }
    }
}
