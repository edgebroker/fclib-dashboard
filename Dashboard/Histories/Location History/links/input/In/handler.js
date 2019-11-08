function handler(In) {
    this.assertProperty(In, this.props["assetproperty"]);
    this.assertProperty(In, this.props["longproperty"]);
    this.assertProperty(In, this.props["latproperty"]);
    if (this.props["eventtimeproperty"])
        this.assertProperty(In, this.props["eventtimeproperty"]);

    var msg = stream.create().message().copyMessage(In);
    this.add(msg);
    this.executeOutputLink("Out", In);
}