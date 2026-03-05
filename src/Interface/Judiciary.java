package Interface;

import java.util.HashMap;

public interface Judiciary {
    boolean pickWord(String topic);
    boolean isCorrectLetter(String letter);
    int getWordLength();
    String getWordWithLetters(Man man);
    void isCorrectWord(Man man);
    String getVerdict(String gameMode, Man man);
    HashMap<String, String> getTopics();
    HashMap<String, String> getGameModes();
}
