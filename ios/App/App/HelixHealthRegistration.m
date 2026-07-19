#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HealthkitPlugin, "CapacitorHealthkit",
  CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(queryQuantity, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(queryCategory, CAPPluginReturnPromise);
)
