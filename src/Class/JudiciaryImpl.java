package Class;
import Interface.*;

import java.util.HashSet;
import java.util.HashMap;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Map;

public class JudiciaryImpl implements Judiciary {
    private HashMap<String, HashSet<String>> glossary;

    public JudiciaryImpl() {
        glossary = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new FileReader("GLOSSARY.txt"))) {
            String line;
            String topic;
            String word;
            HashSet<String> wordSet = null;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("#")) {
                    topic = line.replace("#", "");
                    wordSet = new HashSet<>();
                    glossary.put(topic.toUpperCase(), wordSet);
                }
                word = reader.readLine();
                if (word != null && !word.equals("")) {
                    wordSet.add(word.toUpperCase());
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    public void printGlossary() {
        for (HashMap.Entry set: glossary.entrySet()) {
            System.out.println(set);
        }
     }

    @Override
    public boolean pickWord(){return true;};

    @Override
    public boolean isCorrectLetter(char letter){return true;};

    @Override
    public String getWordWithLetters(Man man){return new String();};

    @Override
    public boolean isCorrectWord(Man man){return true;};

    @Override
    public String giveVerdict(Man man){return new String();};

}
