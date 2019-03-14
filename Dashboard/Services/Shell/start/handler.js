function handler() {
    stream.output(this.metaRegistryTopic).send(
        stream.create()
            .message()
            .textMessage()
            .property("registryrequest").set(true)
            .property("streamname").set(this.streamname)
            .property("available").set(true)
            .body(JSON.stringify(this.streammeta))
    );
    stream.output(this.registryTopic).send(
        stream.create()
            .message()
            .message()
            .property("registryrequest").set(true)
            .property("streamname").set(this.streamname)
            .property("streamtype").set("service")
            .property("available").set(true)
    );
    if (this.parentStream) {
        stream.log().info("Registering at parent stream: "+this.parentStream);
        stream.output(this.parentStream).send(
            stream.create().message().message()
                .property("registryrequest").set(true)
                .property("operation").set("add")
                .property("streamname").set(this.streamname)
                .property("command").set(this.props["shellname"])
                .property("description").set(this.props["description"])
                .property("shell").set(true)
        );
    }
}