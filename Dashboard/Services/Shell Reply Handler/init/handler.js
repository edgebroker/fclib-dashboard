function handler(){
    var self = this;
    var UUID = Java.type("java.util.UUID");
    var MEMORY = this.compid+"_shellrequests";

    stream.create().memory(MEMORY).heap().createIndex("shellexecuteid");

    this.addRequest = function(request){
        request.property("shellexecuteid").set(UUID.randomUUID().toString());
        stream.memory(MEMORY).add(request);
    };

    this.setOriginalRequest = function(requestId){
        var result = stream.memory(MEMORY).index("shellexecuteid").get(requestId);
        if (result.size() === 1) {
            self.originalRequest = result.first();
            stream.memory(MEMORY).index("shellexecuteid").remove(requestId);
        }
    };

    this.setOutputReference("OriginalRequest", function(){return self.originalRequest;})
}