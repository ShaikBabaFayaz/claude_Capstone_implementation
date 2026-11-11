package com.example.taskmanagement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.example.taskmanagement.domain.Task;
import com.example.taskmanagement.domain.TaskStatus;
import com.example.taskmanagement.dto.PageResponse;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskPatchRequest;
import com.example.taskmanagement.dto.TaskReplaceRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.repository.TaskRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class TaskServiceTest {

    @Mock
    private TaskRepository repository;

    private TaskService service;

    @BeforeEach
    void setUp() {
        service = new TaskService(repository);
    }

    private static Task task(long id, String title, String description, TaskStatus status) {
        Task t = new Task();
        t.setId(id);
        t.setTitle(title);
        t.setDescription(description);
        t.setStatus(status);
        return t;
    }

    private void saveReturnsArgument() {
        when(repository.saveAndFlush(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ---- create ----

    @Test
    void createDefaultsStatusToTodoWhenAbsent() {
        saveReturnsArgument();
        TaskCreateRequest request = new TaskCreateRequest();
        request.setTitle("t");
        request.setDescription("d");

        TaskResponse response = service.create(request);

        assertThat(response.status()).isEqualTo(TaskStatus.TODO);
        assertThat(response.title()).isEqualTo("t");
        assertThat(response.description()).isEqualTo("d");
    }

    @Test
    void createHonoursSuppliedStatus() {
        saveReturnsArgument();
        TaskCreateRequest request = new TaskCreateRequest();
        request.setTitle("t");
        request.setStatus(Optional.of(TaskStatus.DONE));

        assertThat(service.create(request).status()).isEqualTo(TaskStatus.DONE);
    }

    // ---- get ----

    @Test
    void getReturnsTask() {
        when(repository.findById(1L)).thenReturn(Optional.of(task(1, "t", "d", TaskStatus.IN_PROGRESS)));

        TaskResponse response = service.get(1L);

        assertThat(response.id()).isEqualTo(1L);
        assertThat(response.status()).isEqualTo(TaskStatus.IN_PROGRESS);
    }

    @Test
    void getThrowsWhenMissing() {
        when(repository.findById(9L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(9L)).isInstanceOf(TaskNotFoundException.class);
    }

    // ---- list ----

    @Test
    void listMapsPageToPageResponseOrderedById() {
        Pageable[] captured = new Pageable[1];
        when(repository.findAll(any(Pageable.class))).thenAnswer(inv -> {
            captured[0] = inv.getArgument(0);
            return new PageImpl<>(
                    List.of(task(1, "a", null, TaskStatus.TODO), task(2, "b", null, TaskStatus.DONE)),
                    captured[0],
                    5);
        });

        PageResponse<TaskResponse> response = service.list(1, 2);

        assertThat(captured[0].getPageNumber()).isEqualTo(1);
        assertThat(captured[0].getPageSize()).isEqualTo(2);
        assertThat(captured[0].getSort()).isEqualTo(Sort.by("id").ascending());
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(5);
        assertThat(response.totalPages()).isEqualTo(3);
        assertThat(response.content()).extracting(TaskResponse::title).containsExactly("a", "b");
    }

    // ---- replace ----

    @Test
    void replaceOverwritesAllFieldsAndClearsAbsentDescription() {
        Task existing = task(1, "old", "old desc", TaskStatus.TODO);
        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        saveReturnsArgument();
        TaskReplaceRequest request = new TaskReplaceRequest();
        request.setTitle("new");
        request.setStatus(TaskStatus.DONE);

        TaskResponse response = service.replace(1L, request);

        assertThat(response.title()).isEqualTo("new");
        assertThat(response.description()).isNull();
        assertThat(response.status()).isEqualTo(TaskStatus.DONE);
    }

    @Test
    void replaceThrowsWhenMissing() {
        when(repository.findById(9L)).thenReturn(Optional.empty());
        TaskReplaceRequest request = new TaskReplaceRequest();
        request.setTitle("x");
        request.setStatus(TaskStatus.TODO);

        assertThatThrownBy(() -> service.replace(9L, request)).isInstanceOf(TaskNotFoundException.class);
        verify(repository, never()).saveAndFlush(any());
    }

    // ---- patch ----

    @Test
    void patchAbsentFieldsAreKept() {
        when(repository.findById(1L)).thenReturn(Optional.of(task(1, "t", "d", TaskStatus.TODO)));
        saveReturnsArgument();
        TaskPatchRequest request = new TaskPatchRequest();
        request.setStatus(Optional.of(TaskStatus.DONE));

        TaskResponse response = service.patch(1L, request);

        assertThat(response.title()).isEqualTo("t");
        assertThat(response.description()).isEqualTo("d");
        assertThat(response.status()).isEqualTo(TaskStatus.DONE);
    }

    @Test
    void patchExplicitNullDescriptionClears() {
        when(repository.findById(1L)).thenReturn(Optional.of(task(1, "t", "d", TaskStatus.TODO)));
        saveReturnsArgument();
        TaskPatchRequest request = new TaskPatchRequest();
        request.setDescription(Optional.empty());

        TaskResponse response = service.patch(1L, request);

        assertThat(response.description()).isNull();
        assertThat(response.title()).isEqualTo("t");
        assertThat(response.status()).isEqualTo(TaskStatus.TODO);
    }

    @Test
    void patchValueSetsFields() {
        when(repository.findById(1L)).thenReturn(Optional.of(task(1, "t", null, TaskStatus.TODO)));
        saveReturnsArgument();
        TaskPatchRequest request = new TaskPatchRequest();
        request.setTitle(Optional.of("new"));
        request.setDescription(Optional.of("new desc"));

        TaskResponse response = service.patch(1L, request);

        assertThat(response.title()).isEqualTo("new");
        assertThat(response.description()).isEqualTo("new desc");
        assertThat(response.status()).isEqualTo(TaskStatus.TODO);
    }

    @Test
    void patchWithAllFieldsAbsentThrowsEmptyPatch() {
        assertThatThrownBy(() -> service.patch(1L, new TaskPatchRequest()))
                .isInstanceOf(EmptyPatchException.class);
        verifyNoMoreInteractions(repository);
    }

    @Test
    void patchExplicitNullTitleThrowsInvalidPatch() {
        when(repository.findById(1L)).thenReturn(Optional.of(task(1, "t", "d", TaskStatus.TODO)));
        TaskPatchRequest request = new TaskPatchRequest();
        request.setTitle(Optional.empty());

        assertThatThrownBy(() -> service.patch(1L, request)).isInstanceOf(InvalidPatchException.class);
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void patchExplicitNullStatusThrowsInvalidPatch() {
        when(repository.findById(1L)).thenReturn(Optional.of(task(1, "t", "d", TaskStatus.TODO)));
        TaskPatchRequest request = new TaskPatchRequest();
        request.setStatus(Optional.empty());

        assertThatThrownBy(() -> service.patch(1L, request)).isInstanceOf(InvalidPatchException.class);
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void patchThrowsWhenMissing() {
        when(repository.findById(9L)).thenReturn(Optional.empty());
        TaskPatchRequest request = new TaskPatchRequest();
        request.setTitle(Optional.of("x"));

        assertThatThrownBy(() -> service.patch(9L, request)).isInstanceOf(TaskNotFoundException.class);
        verify(repository, never()).saveAndFlush(any());
    }

    // ---- delete ----

    @Test
    void deleteRemovesExistingTask() {
        Task existing = task(1, "t", null, TaskStatus.TODO);
        when(repository.findById(1L)).thenReturn(Optional.of(existing));

        service.delete(1L);

        ArgumentCaptor<Task> captor = ArgumentCaptor.forClass(Task.class);
        verify(repository).delete(captor.capture());
        assertThat(captor.getValue()).isSameAs(existing);
    }

    @Test
    void deleteThrowsWhenMissing() {
        when(repository.findById(9L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(9L)).isInstanceOf(TaskNotFoundException.class);
        verify(repository, never()).delete(any());
    }
}
