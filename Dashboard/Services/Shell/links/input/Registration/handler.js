function handler(Registration) {
    if (Registration.property("operation").value().toString() === "add")
        this.registerCommand(Registration);
    else
        this.unregisterCommand(Registration);

}