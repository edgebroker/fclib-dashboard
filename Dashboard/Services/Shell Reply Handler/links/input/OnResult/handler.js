function handler(OnResult){
    this.assertProperty(OnResult, "shellexecuteid");
    this.setOriginalRequest(OnResult.property("shellexecuteid").value().toString());
    this.executeOutputLink("Result", OnResult);
}