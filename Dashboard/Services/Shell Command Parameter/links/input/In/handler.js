function handler(In) {
    var parmArray = [];
    if (In.property("parameters").exists())
        parmArray = JSON.parse(In.property("parameters").value().toString());
    var parm = {};
    parm["name"] = this.props["name"];
    parm["description"] = this.props["description"];
    parm["converttotype"] = this.props["converttotype"];
    parm["mandatory"] = this.props["mandatory"];

    var validator = {};

    switch (this.props["type"]){
        case "boolean":
            validator["type"] = "choice";
            validator["values"] = ["true", "false"];
            break;
        case "choice":
            validator["type"] = "choice";
            if (this.props["choice"])
                validator["values"] = this.props["choice"];
            else
                validator["values"] = [];
            break;
        default:
            validator["type"] = this.props["type"];
            break;
    }
    parm["validator"] = validator;
    parmArray.push(parm);
    var outMsg = stream.create().message().copyMessage(In);
    outMsg.property("parameters").set(JSON.stringify(parmArray));
    this.executeOutputLink("Out", outMsg);
}