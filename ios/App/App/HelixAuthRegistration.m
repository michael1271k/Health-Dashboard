#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HelixAuthPlugin, "HelixAuth",
  CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(authenticate, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setSecret, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getSecret, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(removeSecret, CAPPluginReturnPromise);
)
