/**
 * Generate an encryption key from the passphrase using PBKDF2.
 * @param {string} passphrase - The user's passphrase.
 * @returns {CryptoKey} The derived encryption key.
 */
export async function generateKeyFromPassphrase(passphrase) {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("static-salt"), // Consider using a unique salt per user
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-GCM.
 * @param {CryptoKey} key - The encryption key.
 * @param {string} data - Data to encrypt.
 * @returns {string} Base64-encoded encrypted data.
 */
/*
export async function encryptData(key, data) {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(data)
  );

  

  return btoa(String.fromCharCode(...new Uint8Array(iv)) + String.fromCharCode(...new Uint8Array(encrypted)));
}
  */
 /*
export async function encryptData(key, data) {
  try {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(data)
    );

    // Convert iv and encrypted data to a single Uint8Array
    const encryptedBytes = new Uint8Array(iv.length + encrypted.byteLength);
    encryptedBytes.set(iv);
    encryptedBytes.set(new Uint8Array(encrypted), iv.length);

    // Encode as Base64 (safe for storage)
    return btoa(String.fromCharCode(...encryptedBytes));
  } catch (error) {
    console.error("Encryption failed:", error);
    return null;
  }
}
*/



/**
 * Decrypt data using AES-GCM.
 * @param {CryptoKey} key - The encryption key.
 * @param {string} encryptedData - The base64 encoded encrypted data.
 * @returns {string} Decrypted data.
 */
/*
export async function decryptData(key, encryptedData) {
  try {
    const dataBuffer = atob(encryptedData);
    const iv = new Uint8Array(dataBuffer.slice(0, 12).split("").map(c => c.charCodeAt(0)));
    const encryptedBytes = new Uint8Array(dataBuffer.slice(12).split("").map(c => c.charCodeAt(0)));

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedBytes
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}
  */
 /*
export async function decryptData(key, encryptedData) {
  try {
    // Convert Base64 string to Uint8Array
    const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract IV (first 12 bytes) and Ciphertext (remaining bytes)
    const iv = encryptedBytes.slice(0, 12);
    const cipherText = encryptedBytes.slice(12);

    // Decrypt using AES-GCM
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherText
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}
  */
export async function encryptData(key, data) {
  try {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(data)
    );
    
    // Convert iv and encrypted data to a single Uint8Array
    const encryptedBytes = new Uint8Array(iv.length + encrypted.byteLength);
    encryptedBytes.set(iv);
    encryptedBytes.set(new Uint8Array(encrypted), iv.length);
    
    // Use a URL-safe base64 encoding
    return arrayBufferToBase64(encryptedBytes);
  } catch (error) {
    console.error("Encryption failed:", error);
    return null;
  }
}
// Helper function to safely convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function decryptData(key, encryptedBase64) {
  try {
    // Convert base64 back to Uint8Array
    const encryptedBytes = base64ToArrayBuffer(encryptedBase64);
    
    // Extract the IV (first 12 bytes) and the encrypted data
    const iv = encryptedBytes.slice(0, 12);
    const encryptedData = encryptedBytes.slice(12);
    
    // Decrypt the data
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );
    
    // Convert the decrypted data back to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

function base64ToArrayBuffer(base64) {
  // Convert URL-safe base64 back to standard base64 if needed
  const base64Standard = base64.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  const padding = base64Standard.length % 4;
  const paddedBase64 = padding ? 
    base64Standard + '='.repeat(4 - padding) : 
    base64Standard;
  
  // Decode base64 to binary string
  const binaryString = atob(paddedBase64);
  
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/*
export async function decryptData(key, encryptedData) {
  try {
    console.log(key)
    console.log(encryptData)
    // Convert Base64 string to Uint8Array using the safe method
    const encryptedBytes = base64ToArrayBuffer(encryptedData);
    
    // Extract IV (first 12 bytes) and Ciphertext (remaining bytes)
    const iv = encryptedBytes.slice(0, 12);
    const cipherText = encryptedBytes.slice(12);
    
    // Decrypt using AES-GCM
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherText
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}
*/
/*
export async function decryptData(key, encryptedData) {
  try {
    // First, perform a safer Base64 decoding
    let binaryString;
    try {
      binaryString = atob(encryptedData);
    } catch (e) {
      console.error("Base64 decoding failed:", e);
      return null;
    }
    
    // Check if the binary string is at least 12 bytes long (for IV)
    if (binaryString.length < 12) {
      throw new Error("Encrypted data too short - missing IV");
    }
    
    // Convert binary string to Uint8Array
    const encryptedBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      encryptedBytes[i] = binaryString.charCodeAt(i);
    }
    
    // Extract IV (first 12 bytes) and Ciphertext (remaining bytes)
    const iv = encryptedBytes.slice(0, 12);
    const cipherText = encryptedBytes.slice(12);
    
    // Decrypt using AES-GCM
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherText
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    // Log more details for debugging
    console.log("Encrypted data length:", encryptedData.length);
    console.log("First few characters:", encryptedData.substring(0, 20));
    return null;
  }
}


// Helper function to safely convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  // Restore standard base64 characters
  const standardBase64 = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  // Add padding if needed
  const padding = standardBase64.length % 4;
  const paddedBase64 = padding ? 
    standardBase64 + '='.repeat(4 - padding) : 
    standardBase64;
  
  const binary = atob(paddedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
  */