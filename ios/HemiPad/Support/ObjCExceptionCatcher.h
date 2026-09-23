#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Rattrape une exception Objective-C et la rend à Swift sous forme d'erreur.
///
/// CoreBluetooth signale certaines erreurs d'utilisation par une exception
/// Objective-C plutôt que par une erreur : un descripteur qu'iOS refuse, un
/// service mal formé. Swift ne sait pas les intercepter, et l'application
/// s'arrête net. Chaque appel CoreBluetooth risqué passe donc par ici : au pire
/// la fonction concernée est désactivée, jamais l'application ne s'arrête.
@interface ObjCExceptionCatcher : NSObject

+ (BOOL)run:(NS_NOESCAPE void (^)(void))block error:(NSError *_Nullable *_Nullable)error
    NS_SWIFT_NAME(run(_:));

@end

NS_ASSUME_NONNULL_END
