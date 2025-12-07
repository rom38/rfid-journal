#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 5
#define RST_PIN 2
MFRC522 rfid(SS_PIN, RST_PIN);

// Используем 16-битные UUID (они автоматически преобразуются в 128-битные)
#define SERVICE_UUID        "4FAF"
#define CHARACTERISTIC_UUID "BEB5"

BLECharacteristic *pCharacteristic;
bool deviceConnected = false;
String lastRFID = "";

class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { 
        deviceConnected = true; 
        Serial.println("Device connected");
    }
    void onDisconnect(BLEServer* pServer) { 
        deviceConnected = false; 
        Serial.println("Device disconnected");
        BLEDevice::startAdvertising();
    }
};

void setup() {
    Serial.begin(115200);
    SPI.begin();
    rfid.PCD_Init();
    
    BLEDevice::init("ESP32-RFID");
    BLEServer *pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());
    
    BLEService *pService = pServer->createService(SERVICE_UUID);
    
    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_NOTIFY
    );
    
    pService->start();
    
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();
    
    Serial.println("Waiting for client connection...");
    Serial.println("Service UUID: " + String(SERVICE_UUID));
    Serial.println("Characteristic UUID: " + String(CHARACTERISTIC_UUID));
}

void loop() {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        String rfidUID = "";
        for (byte i = 0; i < rfid.uid.size; i++) {
            if (rfid.uid.uidByte[i] < 0x10) rfidUID += "0";
            rfidUID += String(rfid.uid.uidByte[i], HEX);
        }
        rfidUID.toUpperCase();
        
        if (rfidUID != lastRFID) {
            lastRFID = rfidUID;
            Serial.println("RFID: " + rfidUID);
            
            if (deviceConnected) {
                pCharacteristic->setValue(rfidUID.c_str());
                pCharacteristic->notify();
                Serial.println("Sent via BLE");
            }
        }
        rfid.PICC_HaltA();
    }
    delay(500);
}