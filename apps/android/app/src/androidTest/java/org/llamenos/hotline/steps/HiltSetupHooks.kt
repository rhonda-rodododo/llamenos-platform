package org.llamenos.hotline.steps

import io.cucumber.java.Before
import javax.inject.Inject

/**
 * Cucumber hooks that run before each scenario to set up Hilt DI.
 *
 * The [ComposeRuleHolder] must call [inject] to trigger Hilt field injection
 * for all step definition classes that use @Inject fields.
 */
class HiltSetupHooks {

    @Inject
    lateinit var composeRuleHolder: ComposeRuleHolder

    @Before(order = 0)
    fun injectHilt() {
        composeRuleHolder.inject()
    }
}
