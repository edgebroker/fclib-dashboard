function handler(In) {
    var msg = stream.create().message().message();
    switch (this.groupProp) {
        case 'JMSDestination':
            if (In.destination() === null)
                msg.property(this.groupProp).set("unknown");
            else
                msg.property(this.groupProp).set(getDestination(In.destination()));
            break;
        case 'JMSPriority':
            msg.property(this.groupProp).set(In.priority());
            break;
        case 'JMSDeliveryMode':
            msg.property(this.groupProp).set(In.isPersistent() ? "PERSISTENT" : "NONPERSISTENT");
            break;
        default:
            if (!In.property(this.groupProp).exists())
                msg.property(this.groupProp).set("unknown");
            else
                msg.property(this.groupProp).set(In.property(this.groupProp).value().toObject());
            break;
    }
    switch (this.valueProp) {
        case "count":
            msg.property(this.valueProp).set(1);
            break;
        case "size":
            msg.property(this.valueProp).set(In.size() / 1024);
            break;
        default:
            if (!In.property(this.valueProp).exists())
                msg.property(this.valueProp).set(0);
            else
                msg.property(this.valueProp).set(In.property(this.valueProp).value().toObject());
            break;
    }
    stream.memoryGroup(this.memory_sec).add(msg);
}