function handler(OnError){
    this.assertProperty(OnError, "shellexecuteid");
    this.setOriginalRequest(OnError.property("shellexecuteid").value().toString());
    this.executeOutputLink("Error", OnError);
}