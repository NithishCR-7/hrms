import { AsYouType, parsePhoneNumberFromString, getCountryCallingCode } from "libphonenumber-js";
import { COUNTRY_RULES } from "@/lib/constants/countries";

/**
 * Format raw typed digits real-time using libphonenumber-js
 */
export function formatPhoneNumber(rawDigits, countryCode = "IN") {
  if (!rawDigits) return "";
  const cleanDigits = rawDigits.replace(/\D/g, "");
  try {
    const callingCode = getCountryCallingCode(countryCode);
    const full = `+${callingCode}${cleanDigits}`;
    const formatter = new AsYouType(countryCode);
    const formatted = formatter.input(full);
    const prefix = `+${callingCode}`;
    if (formatted.startsWith(prefix)) {
      return formatted.slice(prefix.length).trim();
    }
    return formatted;
  } catch {
    return cleanDigits;
  }
}

/**
 * Validate incoming phone number for a country using Google's libphonenumber-js
 */
export function validatePhoneNumber(rawDigits, countryCode = "IN") {
  const country = COUNTRY_RULES.find((c) => c.code === countryCode) || COUNTRY_RULES[0];
  const digitsOnly = rawDigits ? rawDigits.replace(/\D/g, "") : "";

  if (!digitsOnly) {
    return { isValid: false, message: "", digitsOnly, fullNumber: "" };
  }

  try {
    const callingCode = getCountryCallingCode(countryCode);
    const fullInput = `+${callingCode}${digitsOnly}`;
    const phoneNumber = parsePhoneNumberFromString(fullInput, countryCode);

    if (phoneNumber && phoneNumber.isValid()) {
      return {
        isValid: true,
        message: `✓ Valid ${country.name} phone number`,
        digitsOnly,
        fullNumber: phoneNumber.formatInternational(),
      };
    }

    if (phoneNumber && phoneNumber.isPossible()) {
      return {
        isValid: false,
        message: `Incomplete number for ${country.name}`,
        digitsOnly,
        fullNumber: fullInput,
      };
    }

    return {
      isValid: false,
      message: `Invalid number for ${country.name}`,
      digitsOnly,
      fullNumber: fullInput,
    };
  } catch {
    return {
      isValid: false,
      message: `Invalid format for ${country.name}`,
      digitsOnly,
      fullNumber: `+${country.dialCode} ${digitsOnly}`,
    };
  }
}
