#import <Foundation/Foundation.h>
#import <Security/Security.h>

// Read the passwords inside the importing process. No secret travels in argv.
static void check(OSStatus status) {
    if (status != errSecSuccess) {
        fprintf(stderr, "Security framework returned %d\n", (int)status);
        exit(1);
    }
}

int main(int argc, const char **argv) {
    @autoreleasepool {
        if (argc != 2) return 2;
        NSDictionary *env = NSProcessInfo.processInfo.environment;
        NSString *password = env[@"APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD"];
        NSData *p12 = [[NSData alloc] initWithBase64EncodedString:env[@"APPLE_DEVELOPER_ID_CERTIFICATE_P12"] options:0];
        const char *temporaryPassword = getenv("TEMP_KEYCHAIN_PASSWORD");
        if (!p12 || !password || !temporaryPassword) return 2;
        check(SecKeychainSetUserInteractionAllowed(false));
        SecKeychainRef keychain = NULL;
        check(SecKeychainCreate(argv[1], (UInt32)strlen(temporaryPassword), temporaryPassword, false, NULL, &keychain));
        SecTrustedApplicationRef codesign = NULL;
        check(SecTrustedApplicationCreateFromPath("/usr/bin/codesign", &codesign));
        SecAccessRef access = NULL;
        check(SecAccessCreate(CFSTR("ReleaseBits signing"), (__bridge CFArrayRef)@[(__bridge id)codesign], &access));
        SecExternalFormat format = kSecFormatPKCS12;
        SecExternalItemType type = kSecItemTypeAggregate;
        SecItemImportExportKeyParameters params = {0};
        params.version = SEC_KEY_IMPORT_EXPORT_PARAMS_VERSION;
        params.passphrase = (__bridge CFStringRef)password;
        params.accessRef = access;
        check(SecItemImport((__bridge CFDataRef)p12, CFSTR("identity.p12"), &format, &type, 0, &params, keychain, NULL));
    }
    return 0;
}
