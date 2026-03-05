package Interface;

public interface Hangman {
    String[] hangUp(Man man);
    String[] applySanction(boolean isCorrect, Man man);
}
