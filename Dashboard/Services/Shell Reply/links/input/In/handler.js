function handler(In) {
    if (In.type() !== "text")
        throw "Incoming message is not a text message";
    var streamname = "stream_" + stream.routerName() + "_" + stream.fullyQualifiedName().replace(/\./g, "_") + "_shell_" + this.props["shellname"];
    var msg = {
        msgtype: "servicereply",
        streamname: streamname,
        eventtype: "commandresult",
        body: {
            time: time.currentTime(),
            message: null
        }
    };
    var text = this.flowcontext.substitute(this.props["message"]);

    In.properties().forEach(function(prop){
        text = replaceAll(text, "\\{"+prop.name()+"\\}", prop.value().toString());
    });
    if (this.props["isjson"] === true)
        text = JSON.stringify(JSON.parse(text));
    msg.body.message = [this.props["outcome"], text];
    In.property("streamdata").set(true);
    In.property("streamname").set(streamname);
    In.body(JSON.stringify(msg));
    this.executeOutputLink("Out", In);

    function replaceAll(str, find, replace) {
        return str.replace(new RegExp(find, 'g'), replace);
    }
}