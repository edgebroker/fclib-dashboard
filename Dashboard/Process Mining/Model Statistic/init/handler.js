function handler() {
    var self = this;
    this.setOutputReference("Model Statistic", execRef);

    function execRef() {
        return self.getInputReference("Process Model")().getModelStats();
    }
}