import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/core/encryption'

const encryptionConfig = defineConfig({
  /**
   * Default encryption driver used by the application.
   */
  default: 'gcm',

  list: {
    gcm: drivers.aes256gcm({
      /**
       * Keys used for encryption/decryption.
       * First key encrypts, all keys are tried for decryption.
       *
       * `APP_KEY_PREVIOUS` is optional and exists purely for rotation: set it
       * to the outgoing key so ciphertext written before the rotation (stored
       * integration secrets and payment credentials) stays readable until it
       * has been re-encrypted under the new key.
       */
      keys: [env.get('APP_KEY'), env.get('APP_KEY_PREVIOUS')].filter(
        (key): key is NonNullable<typeof key> => Boolean(key)
      ),

      /**
       * Stable identifier for this driver.
       */
      id: 'gcm',
    }),
  },
})

export default encryptionConfig

/**
 * Inferring types for the list of encryptors you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface EncryptorsList extends InferEncryptors<typeof encryptionConfig> {}
}
