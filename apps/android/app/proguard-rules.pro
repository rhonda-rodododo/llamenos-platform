# llamenos-core JNI bindings — keep native method declarations and CryptoService public API
-keepclasseswithmembernames class org.llamenos.hotline.crypto.** {
    native <methods>;
}
-keepclassmembers class org.llamenos.hotline.crypto.CryptoService {
    <fields>;
    <init>(...);
}
-keepclassmembers class org.llamenos.hotline.crypto.EncryptedKeyData { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.AuthToken { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.Keypair { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.EncryptedNote { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.NoteEnvelope { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.EncryptedMessage { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.MessageEnvelope { <fields>; <init>(...); }
-keepclassmembers class org.llamenos.hotline.crypto.PinLockoutState$* { <fields>; <init>(...); }

# Keep UniFFI-generated Kotlin bindings (org.llamenos.core package per uniffi.toml)
-keep class org.llamenos.core.** { *; }

# JNA classes used by UniFFI
-keep class com.sun.jna.** { *; }
-dontwarn com.sun.jna.**

# kotlinx.serialization — keep @Serializable model classes (fields + constructors)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class org.llamenos.hotline.**$$serializer { *; }
-keepclassmembers class org.llamenos.hotline.** {
    *** Companion;
}
-keepclasseswithmembers class org.llamenos.hotline.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# API model classes — keep fields and constructors for serialization
-keepclassmembers class org.llamenos.hotline.api.models.** { <fields>; <init>(...); }
-keep @kotlinx.serialization.Serializable class org.llamenos.hotline.** { *; }

# Auth-related model classes
-keepclassmembers class org.llamenos.hotline.ui.auth.StoredKeyData { <fields>; <init>(...); }

# OkHttp
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Hilt
-dontwarn dagger.hilt.**

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Prevent R8 from stripping security-sensitive classes
-keep class androidx.security.crypto.EncryptedSharedPreferences { *; }
-keep class androidx.security.crypto.MasterKey { *; }
-keep class androidx.security.crypto.MasterKey$Builder { *; }

# Compose — keep lambda group classes and stability annotations intact
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**
-keepclassmembers class * {
    @androidx.compose.runtime.Composable <methods>;
}

# Firebase Messaging — keep service and message handler entry points
-keep class com.google.firebase.messaging.FirebaseMessagingService { *; }
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }
-dontwarn com.google.firebase.**

# CameraX — keep use-case and lifecycle integration classes
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ML Kit barcode scanning
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }

# Linphone SDK — native bridge and listener interfaces must survive shrinking
-keep class org.linphone.** { *; }
-dontwarn org.linphone.**

# DataStore Preferences — keep generated Proto/Preferences serialization
-keep class androidx.datastore.** { *; }
-dontwarn androidx.datastore.**

# Kotlin coroutines — keep debug metadata and continuation classes
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}
-dontwarn kotlinx.coroutines.**
