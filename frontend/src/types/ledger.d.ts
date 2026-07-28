declare module "@ledgerhq/hw-transport-webhid" {
  const TransportWebHID: {
    create(): Promise<any>;
  };

  export default TransportWebHID;
}

declare module "@ledgerhq/hw-transport-webusb" {
  const TransportWebUSB: {
    create(): Promise<any>;
  };

  export default TransportWebUSB;
}

declare module "@ledgerhq/hw-app-str" {
  const StrApp: new (transport: any) => any;

  export default StrApp;
}
