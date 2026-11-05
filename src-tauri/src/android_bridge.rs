//! Calls into the Kotlin helpers that ship with the Android project (see android/kotlin).
//! On every other platform these are harmless no-ops, so the same commands compile everywhere.

/// Hands today's task list to the home screen widget.
pub fn widget_update(json: &str) -> Result<(), String> {
    imp::widget_update(json)
}

/// Applies the privacy options to the app window: hide it in the recent apps list, block screenshots.
pub fn privacy_set(block_screenshots: bool, hide_in_recents: bool) -> Result<(), String> {
    imp::privacy_set(block_screenshots, hide_in_recents)
}

#[cfg(not(target_os = "android"))]
mod imp {
    pub fn widget_update(_json: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn privacy_set(_block: bool, _recents: bool) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(target_os = "android")]
mod imp {
    use jni::objects::{JClass, JObject, JValue};
    use jni::{JNIEnv, JavaVM};

    const PKG: &str = "app.atonacht.notes";

    /// Runs `f` with a JNI environment and the Android application context.
    fn with_context<T>(f: impl FnOnce(&mut JNIEnv, &JObject) -> Result<T, jni::errors::Error>) -> Result<T, String> {
        let cx = ndk_context::android_context();
        // SAFETY: ndk-context hands out the process-wide JavaVM and application Context pointers set up when the app started.
        let vm = unsafe { JavaVM::from_raw(cx.vm().cast()) }.map_err(|e| e.to_string())?;
        let context = unsafe { JObject::from_raw(cx.context().cast()) };
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        let out = f(&mut env, &context);
        if env.exception_check().unwrap_or(false) {
            let _ = env.exception_describe();
            let _ = env.exception_clear();
            return Err("The Android helper threw an error".into());
        }
        out.map_err(|e| e.to_string())
    }

    /// App classes aren't visible to FindClass on a native thread, so load them through the app's own class loader.
    fn load_class<'a>(env: &mut JNIEnv<'a>, context: &JObject, name: &str) -> Result<JClass<'a>, jni::errors::Error> {
        let loader = env.call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?.l()?;
        let jname = env.new_string(format!("{PKG}.{name}"))?;
        let class = env
            .call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[JValue::Object(&jname)])?
            .l()?;
        Ok(JClass::from(class))
    }

    pub fn widget_update(json: &str) -> Result<(), String> {
        with_context(|env, context| {
            let class = load_class(env, context, "WidgetBridge")?;
            let arg = env.new_string(json)?;
            env.call_static_method(
                class,
                "update",
                "(Landroid/content/Context;Ljava/lang/String;)V",
                &[JValue::Object(context), JValue::Object(&arg)],
            )?;
            Ok(())
        })
    }

    pub fn privacy_set(block: bool, recents: bool) -> Result<(), String> {
        with_context(|env, context| {
            let class = load_class(env, context, "PrivacyBridge")?;
            env.call_static_method(
                class,
                "set",
                "(Landroid/content/Context;ZZ)V",
                &[JValue::Object(context), JValue::Bool(block as u8), JValue::Bool(recents as u8)],
            )?;
            Ok(())
        })
    }
}
