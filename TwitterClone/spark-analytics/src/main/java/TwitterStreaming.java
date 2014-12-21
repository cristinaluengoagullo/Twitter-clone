import org.apache.spark.api.java.*;
import org.apache.spark.api.java.function.*;
import org.apache.spark.streaming.*;
import org.apache.spark.SparkConf;
import org.apache.spark.streaming.api.java.*;
import org.apache.spark.streaming.twitter.*;
import twitter4j.*;
import org.apache.spark.streaming.kafka.*;
import java.util.Arrays;
import java.util.*;
import scala.Tuple2;
import java.util.Map;
import java.util.HashMap;
import java.util.regex.Pattern;
import com.google.common.collect.Lists;

public class TwitterStreaming {

  private static final Pattern SPACE = Pattern.compile(" ");
  
  public static void main(String[] args) throws Exception {
    // Location of the Spark directory
    String sparkHome = "/usr/local/spark";
    // URL of the Spark cluster
    String sparkUrl = "local[4]";
    // Location of the required JAR files
    //String jarFile = "../streaming-1.0.jar";

    SparkConf conf = new SparkConf().setMaster(sparkUrl).setAppName("Streaming");
    JavaStreamingContext ssc = new JavaStreamingContext(conf, new Duration(10000)); 
    HashMap<String, Integer> topics = new HashMap();
    topics.put("tweets", 1);
    JavaPairReceiverInputDStream messages = KafkaUtils.createStream(ssc, "localhost:2181", "1", topics);


    JavaDStream<String> lines = messages.map(new Function<Tuple2<String, String>, String>() {
      @Override
      public String call(Tuple2<String, String> tuple2) {
        return tuple2._2();
      }
    });

    JavaDStream<String> words = lines.flatMap(
      new FlatMapFunction<String, String>() {
        public Iterable<String> call(String in) {
          return Arrays.asList(in.split(" "));
        }
      }
    );

   // Seperate the hashtags
   JavaDStream<String> hashTags = words.filter(
     new Function<String, Boolean>() {
       public Boolean call(String word) { return word.startsWith("#"); }
     }
   );

   // Map hashtags to their respective counts
   JavaPairDStream<String, Integer> tuples = hashTags.mapToPair(
      new PairFunction<String, String, Integer>() {
        public Tuple2<String, Integer> call(String in) {
          return new Tuple2<String, Integer>(in, 1);
        }
      }
    );

   // Reduce hashtag maps to aggregate their counts in a sliding window fashion
   // reduceByKeyAndWindow counts hashtags in a 5-minute window that shifts every second
   JavaPairDStream<String, Integer> counts = tuples.reduceByKeyAndWindow(
      new Function2<Integer, Integer, Integer>() {
        public Integer call(Integer i1, Integer i2) { return i1 + i2; }
      },
      new Function2<Integer, Integer, Integer>() {
        public Integer call(Integer i1, Integer i2) { return i1 - i2; }
      },
      new Duration(60 * 10 * 1000),
      new Duration(1 * 10000)
    );

   //Swap the key-value pairs for the counts (in order to sort hashtags by their counts)
   JavaPairDStream<Integer, String> swappedCounts = counts.mapToPair(
     new PairFunction<Tuple2<String, Integer>, Integer, String>() {
       public Tuple2<Integer, String> call(Tuple2<String, Integer> in) {
         return in.swap();
       }
     }
   );

   //Sort swapped map from highest to lowest
   JavaPairDStream<Integer, String> sortedCounts = swappedCounts.transformToPair(
     new Function<JavaPairRDD<Integer, String>, JavaPairRDD<Integer, String>>() {
       public JavaPairRDD<Integer, String> call(JavaPairRDD<Integer, String> in) throws Exception {
         return in.sortByKey(false);
       }
     });

   //Print top 10 hashtags
   sortedCounts.foreach(
     new Function<JavaPairRDD<Integer, String>, Void> () {
       public Void call(JavaPairRDD<Integer, String> rdd) {
         String out = "\nTop 10 hashtags:\n";
         for (Tuple2<Integer, String> t: rdd.take(10)) {
           out = out + t.toString() + "\n";
         }
         System.out.println(out);
         return null;
       }
     }
   );
  ssc.checkpoint("checkpoints");
  ssc.start();
  }
}
