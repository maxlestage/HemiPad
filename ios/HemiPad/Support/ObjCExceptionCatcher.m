#import "ObjCExceptionCatcher.h"

@implementation ObjCExceptionCatcher

+ (BOOL)run:(NS_NOESCAPE void (^)(void))block error:(NSError *_Nullable *_Nullable)error {
    @try {
        block();
        return YES;
    } @catch (NSException *exception) {
        if (error) {
            NSString *raison = exception.reason ?: exception.name;
            *error = [NSError errorWithDomain:@"app.hemipad.objc"
                                         code:1
                                     userInfo:@{
                                         NSLocalizedDescriptionKey: raison,
                                         @"ExceptionName": exception.name
                                     }];
        }
        return NO;
    }
}

@end
