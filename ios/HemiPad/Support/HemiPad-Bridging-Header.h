// Le seul Objective-C de l'application : de quoi rattraper les exceptions
// que CoreBluetooth peut lever, et que Swift ne sait pas intercepter.
#import "ObjCExceptionCatcher.h"

// La bibliothèque Rust : le format des trames du pont, et le choix du chemin
// vers la console. Compilée avant le Swift par une étape du projet.
#import "hemipad_wire.h"
